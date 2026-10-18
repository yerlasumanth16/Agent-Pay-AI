import dns from 'dns';
import net from 'net';
import type { Locator, Page } from 'playwright';
import { browserSessionManager } from './browserSessionManager.js';
import type {
  AllowedKey,
  BrowserActionError,
  BrowserActionRequest,
  BrowserActionResponse,
  BrowserActionType,
  CaptureScreenshotActionResult,
  ClickActionResult,
  ElementTarget,
  FillActionResult,
  LocatorStrategy,
  NavigateActionResult,
  PageInspectionResult,
  PressKeyActionResult,
  ScrollActionResult,
  ScrollDirection,
  SupportedAriaRole,
} from '../types/browserActions.js';

const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_ACTION_TYPES: ReadonlySet<BrowserActionType> = new Set([
  'navigate',
  'inspectPage',
  'click',
  'fill',
  'scroll',
  'pressKey',
  'captureScreenshot',
]);

const ALLOWED_LOCATOR_STRATEGIES: ReadonlySet<LocatorStrategy> = new Set([
  'role',
  'label',
  'placeholder',
  'text',
  'testid',
]);

const ALLOWED_ARIA_ROLES: ReadonlySet<SupportedAriaRole> = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'tab',
  'menuitem',
  'heading',
]);

const ALLOWED_SCROLL_DIRECTIONS: ReadonlySet<ScrollDirection> = new Set([
  'up',
  'down',
  'top',
  'bottom',
]);

const ALLOWED_NAMED_KEYS: ReadonlySet<AllowedKey> = new Set([
  'Enter',
  'Tab',
  'Escape',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Space',
]);

const FORBIDDEN_PAYLOAD_KEYS = [
  'selector',
  'css',
  'xpath',
  'script',
  'evaluate',
  'expression',
  'code',
  'function',
  'command',
  'shell',
];

const CONSEQUENTIAL_ACTION_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(complete|confirm|submit|authorize|execute)\s+(purchase|payment|order|transaction|transfer|payout|checkout)\b/i,
  /\b(buy|pay|order|checkout)\s+now\b/i,
  /\bone[- ]click\s+(buy|purchase|order)\b/i,
  /\bplace\s+(your\s+)?order\b/i,
  /\b(send|transfer|wire|withdraw)\s+(money|funds|payment|crypto|currency)\b/i,
  /\bpay\s+with\s+(paypal|card|bank|wallet)\b/i,
  /\bconfirm\s*&\s*pay\b/i,
  /\bdelete\s+(account|workspace|organization)\b/i,
  /\bclose\s+account\s+permanently\b/i,
];

const SENSITIVE_INPUT_PATTERNS: ReadonlyArray<RegExp> = [
  /\b(card\s*number|credit\s*card|debit\s*card|cc[-_]?num|cc[-_]?number)\b/i,
  /\b(cvv|cvc|security\s*code|card\s*verification|cc[-_]?csc)\b/i,
  /\b(routing\s*number|bank\s*account|iban|swift\s*code)\b/i,
  /\b(password|passcode|secret\s*key|private\s*key|pin\s*code|ssn|social\s*security)\b/i,
];

const CONSEQUENTIAL_URL_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /\/(checkout|payment|pay|transfer|order)\/(confirm|execute|submit|complete|authorize)\b/i,
];

export interface ActionExecutionResult {
  httpStatus: number;
  body: BrowserActionResponse;
}

function getTimestamp(): string {
  return new Date().toLocaleTimeString();
}

export function isExplicitInternalVerificationUrl(parsedUrl: URL): boolean {
  const isLoopbackHost =
    parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === 'localhost';
  const effectivePort =
    parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
  const isAllowedPath =
    parsedUrl.pathname === '/api/browser/local-test-page' ||
    parsedUrl.pathname === '/api/browser/local-test-page-2' ||
    parsedUrl.pathname === '/api/browser/local-test-redirect-private';

  return (
    parsedUrl.protocol === 'http:' &&
    isLoopbackHost &&
    effectivePort === String(PORT) &&
    isAllowedPath &&
    !parsedUrl.username &&
    !parsedUrl.password
  );
}

export function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b, c] = octets;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared address space / CGNAT / internal container mesh)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / Cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 & 192.0.2.0/24
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking / internal)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 198.51.100.0/24 & 203.0.113.0/24
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  // 224.0.0.0/4 (Multicast & reserved 240.0.0.0/4)
  if (a >= 224) return true;

  return false;
}

export function isPrivateOrLoopbackIPv6(rawIp: string): boolean {
  const ip = rawIp.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    ip === '::1' ||
    ip === '::' ||
    ip === '0:0:0:0:0:0:0:1' ||
    ip === '0:0:0:0:0:0:0:0'
  ) {
    return true;
  }

  // Unique local addresses fc00::/7 (fc00..fdff)
  if (ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // Link-local addresses fe80::/10 (fe80..febf)
  if (
    ip.startsWith('fe8') ||
    ip.startsWith('fe9') ||
    ip.startsWith('fea') ||
    ip.startsWith('feb')
  ) {
    return true;
  }

  // Multicast ff00::/8
  if (ip.startsWith('ff')) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith('::ffff:') || ip.startsWith('0:0:0:0:0:ffff:')) {
    const tail = ip.split('ffff:')[1];
    if (tail) {
      if (tail.includes('.')) {
        return isPrivateOrLoopbackIPv4(tail);
      }
      // Hex pair format e.g. 7f00:0001 or 7f00:1
      const hexParts = tail.split(':');
      if (hexParts.length === 2) {
        const high = parseInt(hexParts[0], 16);
        const low = parseInt(hexParts[1], 16);
        if (!Number.isNaN(high) && !Number.isNaN(low)) {
          const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${
            (low >> 8) & 0xff
          }.${low & 0xff}`;
          return isPrivateOrLoopbackIPv4(ipv4);
        }
      }
    }
    return true;
  }

  return false;
}

export function isProhibitedHostnameOrIp(hostname: string): boolean {
  const cleanHost = hostname.replace(/^\[|\]$/g, '').toLowerCase().trim();
  if (!cleanHost) return true;

  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.intranet') ||
    cleanHost.endsWith('.corp') ||
    cleanHost.endsWith('.lan') ||
    cleanHost === 'metadata' ||
    cleanHost === 'metadata.google.internal' ||
    cleanHost === 'instance-data' ||
    cleanHost === '0.0.0.0'
  ) {
    return true;
  }

  // Pure numeric or hex hostnames
  if (/^\d+$/.test(cleanHost) || /^0x[0-9a-f]+$/i.test(cleanHost)) {
    return true;
  }

  const ipVersion = net.isIP(cleanHost);
  if (ipVersion === 4) {
    return isPrivateOrLoopbackIPv4(cleanHost);
  }
  if (ipVersion === 6) {
    return isPrivateOrLoopbackIPv6(cleanHost);
  }

  return false;
}

export async function validateNavigationUrl(
  rawUrl: unknown,
  options?: { approveOrigin?: boolean; isRedirectCheck?: boolean }
): Promise<
  | { valid: true; parsedUrl: URL; isInternalVerificationRoute: boolean }
  | {
      valid: false;
      httpStatus: number;
      error: BrowserActionError;
      approvalRequired?: boolean;
      pendingOrigin?: string;
    }
> {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'MALFORMED_URL',
        message: 'A non-empty URL string is required for navigation.',
      },
    };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048 || /[\u0000-\u001F\u007F]/.test(trimmed)) {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'MALFORMED_URL',
        message: 'URL exceeds maximum length or contains invalid control characters.',
      },
    };
  }

  // Reject scheme-relative or missing-scheme strings before URL constructor
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'MALFORMED_URL',
        message: `Invalid URL "${trimmed}". Full http:// or https:// URL is required.`,
      },
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch (_err) {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'MALFORMED_URL',
        message: `Malformed URL "${trimmed}". Could not parse as a valid URL.`,
      },
    };
  }

  // 1. Validate scheme (Only http: and https:)
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'DISALLOWED_SCHEME',
        message: `Navigation scheme "${parsedUrl.protocol}" is not permitted. Only HTTP and HTTPS URLs are allowed.`,
      },
    };
  }

  // 2. Reject embedded credentials
  if (parsedUrl.username || parsedUrl.password) {
    return {
      valid: false,
      httpStatus: 400,
      error: {
        code: 'EMBEDDED_CREDENTIALS_NOT_ALLOWED',
        message:
          'Navigation URLs containing embedded username or password credentials are prohibited.',
      },
    };
  }

  // 3. Preserve explicit access to the application's local verification route
  if (isExplicitInternalVerificationUrl(parsedUrl)) {
    return {
      valid: true,
      parsedUrl,
      isInternalVerificationRoute: true,
    };
  }

  // 4. Reject loopback, private-network, link-local, or internal destinations
  if (isProhibitedHostnameOrIp(parsedUrl.hostname)) {
    return {
      valid: false,
      httpStatus: 403,
      error: {
        code: options?.isRedirectCheck
          ? 'REDIRECT_BLOCKED'
          : 'PROHIBITED_NETWORK_DESTINATION',
        message: `Navigation to loopback, private-network, or internal destination "${parsedUrl.hostname}" is prohibited.`,
      },
    };
  }

  // 5. Consequential URL path check
  for (const pattern of CONSEQUENTIAL_URL_PATH_PATTERNS) {
    if (pattern.test(parsedUrl.pathname)) {
      return {
        valid: false,
        httpStatus: 403,
        approvalRequired: true,
        error: {
          code: 'CONSEQUENTIAL_ACTION_BLOCKED',
          message:
            'Navigation to a direct payment or purchase confirmation endpoint requires explicit human approval.',
        },
      };
    }
  }

  // 6. Domain-permission policy for external origins
  if (options?.approveOrigin) {
    browserSessionManager.approveOrigin(parsedUrl.origin);
  }

  if (!browserSessionManager.isOriginApproved(parsedUrl.origin)) {
    return {
      valid: false,
      httpStatus: 403,
      approvalRequired: true,
      pendingOrigin: parsedUrl.origin,
      error: {
        code: 'DOMAIN_PERMISSION_REQUIRED',
        message: `External origin "${parsedUrl.origin}" requires domain permission before navigation.`,
        details:
          'Confirm domain permission for this external origin or navigate to an approved origin.',
      },
    };
  }

  // 7. DNS resolution check against DNS rebinding to private/loopback IPs
  const cleanHost = parsedUrl.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost) === 0) {
    try {
      const addresses = await dns.promises.lookup(cleanHost, { all: true });
      for (const addr of addresses) {
        const isBlocked =
          addr.family === 4
            ? isPrivateOrLoopbackIPv4(addr.address)
            : isPrivateOrLoopbackIPv6(addr.address);
        if (isBlocked) {
          return {
            valid: false,
            httpStatus: 403,
            error: {
              code: options?.isRedirectCheck
                ? 'REDIRECT_BLOCKED'
                : 'PROHIBITED_NETWORK_DESTINATION',
              message: `Domain "${cleanHost}" resolved to a prohibited internal or private network address.`,
            },
          };
        }
      }
    } catch (_dnsErr) {
      // If DNS cannot resolve in offline/restricted container, allow Playwright to report navigation outcome or handle below
    }
  }

  return {
    valid: true,
    parsedUrl,
    isInternalVerificationRoute: false,
  };
}

function validateElementTarget(
  rawTarget: unknown
):
  | { valid: true; target: ElementTarget }
  | { valid: false; error: BrowserActionError } {
  if (!rawTarget || typeof rawTarget !== 'object' || Array.isArray(rawTarget)) {
    return {
      valid: false,
      error: {
        code: 'MALFORMED_PAYLOAD',
        message: 'A valid target object with { strategy, value } is required.',
      },
    };
  }

  const obj = rawTarget as Record<string, unknown>;

  for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
    if (forbidden in obj) {
      return {
        valid: false,
        error: {
          code: 'INVALID_LOCATOR_STRATEGY',
          message: `Unsupported target property "${forbidden}". Arbitrary CSS, XPath, or script locators are prohibited.`,
        },
      };
    }
  }

  const strategy = obj.strategy;
  if (
    typeof strategy !== 'string' ||
    !ALLOWED_LOCATOR_STRATEGIES.has(strategy as LocatorStrategy)
  ) {
    return {
      valid: false,
      error: {
        code: 'INVALID_LOCATOR_STRATEGY',
        message:
          'Invalid locator strategy. Supported strategies are: role, label, placeholder, text.',
      },
    };
  }

  const value = obj.value;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 200) {
    return {
      valid: false,
      error: {
        code: 'MALFORMED_PAYLOAD',
        message:
          'Target value must be a non-empty string up to 200 characters.',
      },
    };
  }

  const trimmedVal = value.trim();
  // Reject attempts to smuggle XPath or CSS engine prefixes into text/label values
  if (
    trimmedVal.startsWith('//') ||
    trimmedVal.startsWith('xpath=') ||
    trimmedVal.startsWith('css=') ||
    trimmedVal.startsWith('>>')
  ) {
    return {
      valid: false,
      error: {
        code: 'INVALID_LOCATOR_STRATEGY',
        message:
          'XPath and CSS selector expressions are not permitted inside locator values.',
      },
    };
  }

  let role: SupportedAriaRole | undefined;
  if (strategy === 'role') {
    if (
      typeof obj.role !== 'string' ||
      !ALLOWED_ARIA_ROLES.has(obj.role as SupportedAriaRole)
    ) {
      return {
        valid: false,
        error: {
          code: 'MALFORMED_PAYLOAD',
          message:
            'When strategy is "role", a valid ARIA role (e.g. button, link, textbox, heading) is required.',
        },
      };
    }
    role = obj.role as SupportedAriaRole;
  }

  let index = 0;
  if (obj.index !== undefined) {
    if (
      typeof obj.index !== 'number' ||
      !Number.isInteger(obj.index) ||
      obj.index < 0 ||
      obj.index > 25
    ) {
      return {
        valid: false,
        error: {
          code: 'MALFORMED_PAYLOAD',
          message: 'Target index must be an integer between 0 and 25.',
        },
      };
    }
    index = obj.index;
  }

  return {
    valid: true,
    target: {
      strategy: strategy as LocatorStrategy,
      value: trimmedVal,
      role,
      exact: Boolean(obj.exact),
      index,
    },
  };
}

export function validateActionRequest(
  rawBody: unknown
):
  | { valid: true; request: BrowserActionRequest }
  | { valid: false; httpStatus: number; action: string; error: BrowserActionError } {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return {
      valid: false,
      httpStatus: 400,
      action: 'unknown',
      error: {
        code: 'MALFORMED_PAYLOAD',
        message: 'Request body must be a JSON object.',
      },
    };
  }

  const body = rawBody as Record<string, unknown>;
  const rawAction = typeof body.action === 'string' ? body.action : '';

  if (!rawAction) {
    return {
      valid: false,
      httpStatus: 400,
      action: 'unknown',
      error: {
        code: 'MALFORMED_PAYLOAD',
        message: 'Missing required "action" field in request payload.',
      },
    };
  }

  for (const forbidden of FORBIDDEN_PAYLOAD_KEYS) {
    if (forbidden in body) {
      return {
        valid: false,
        httpStatus: 400,
        action: rawAction,
        error: {
          code: 'INVALID_LOCATOR_STRATEGY',
          message: `Forbidden field "${forbidden}" in action request. Arbitrary CSS, XPath, or JavaScript execution is prohibited.`,
        },
      };
    }
  }

  if (!ALLOWED_ACTION_TYPES.has(rawAction as BrowserActionType)) {
    return {
      valid: false,
      httpStatus: 400,
      action: rawAction,
      error: {
        code: 'INVALID_ACTION_TYPE',
        message: `Unsupported browser action "${rawAction}". Allowed actions: navigate, inspectPage, click, fill, scroll, pressKey, captureScreenshot.`,
      },
    };
  }

  const action = rawAction as BrowserActionType;

  switch (action) {
    case 'navigate': {
      if (typeof body.url !== 'string') {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: {
            code: 'MALFORMED_PAYLOAD',
            message: 'The "navigate" action requires a string "url" parameter.',
          },
        };
      }
      return {
        valid: true,
        request: {
          action: 'navigate',
          url: body.url,
          approveOrigin: Boolean(body.approveOrigin),
        },
      };
    }

    case 'inspectPage': {
      return {
        valid: true,
        request: { action: 'inspectPage' },
      };
    }

    case 'captureScreenshot': {
      return {
        valid: true,
        request: { action: 'captureScreenshot' },
      };
    }

    case 'click': {
      const targetValidation = validateElementTarget(body.target);
      if (!targetValidation.valid) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: targetValidation.error,
        };
      }
      return {
        valid: true,
        request: {
          action: 'click',
          target: targetValidation.target,
        },
      };
    }

    case 'fill': {
      const targetValidation = validateElementTarget(body.target);
      if (!targetValidation.valid) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: targetValidation.error,
        };
      }
      if (typeof body.value !== 'string' || body.value.length > 2000) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: {
            code: 'MALFORMED_PAYLOAD',
            message:
              'The "fill" action requires a string "value" parameter (max 2000 characters).',
          },
        };
      }
      return {
        valid: true,
        request: {
          action: 'fill',
          target: targetValidation.target,
          value: body.value,
        },
      };
    }

    case 'scroll': {
      const direction = body.direction;
      if (
        typeof direction !== 'string' ||
        !ALLOWED_SCROLL_DIRECTIONS.has(direction as ScrollDirection)
      ) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: {
            code: 'MALFORMED_PAYLOAD',
            message:
              'The "scroll" action requires a valid "direction" ("up", "down", "top", or "bottom").',
          },
        };
      }
      let amount = 360;
      if (body.amount !== undefined) {
        if (
          typeof body.amount !== 'number' ||
          !Number.isFinite(body.amount) ||
          body.amount < 20 ||
          body.amount > 4000
        ) {
          return {
            valid: false,
            httpStatus: 400,
            action,
            error: {
              code: 'MALFORMED_PAYLOAD',
              message:
                'Scroll "amount" must be a number between 20 and 4000 pixels.',
            },
          };
        }
        amount = Math.round(body.amount);
      }
      return {
        valid: true,
        request: {
          action: 'scroll',
          direction: direction as ScrollDirection,
          amount,
        },
      };
    }

    case 'pressKey': {
      const rawKey = body.key;
      if (typeof rawKey !== 'string' || !rawKey.trim()) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: {
            code: 'MALFORMED_PAYLOAD',
            message: 'The "pressKey" action requires a non-empty "key" string.',
          },
        };
      }
      const key = rawKey.trim();
      const isAllowedNamed = ALLOWED_NAMED_KEYS.has(key as AllowedKey);
      const isSingleAlphanumeric = /^[a-zA-Z0-9]$/.test(key);
      if (!isAllowedNamed && !isSingleAlphanumeric) {
        return {
          valid: false,
          httpStatus: 400,
          action,
          error: {
            code: 'MALFORMED_PAYLOAD',
            message: `Unsupported key "${key}". Allowed keys: ${Array.from(
              ALLOWED_NAMED_KEYS
            ).join(', ')}, or a single alphanumeric character.`,
          },
        };
      }

      let validatedTarget: ElementTarget | undefined;
      if (body.target !== undefined) {
        const targetCheck = validateElementTarget(body.target);
        if (!targetCheck.valid) {
          return {
            valid: false,
            httpStatus: 400,
            action,
            error: targetCheck.error,
          };
        }
        validatedTarget = targetCheck.target;
      }

      return {
        valid: true,
        request: {
          action: 'pressKey',
          key,
          target: validatedTarget,
        },
      };
    }
  }
}

export function isConsequentialText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return CONSEQUENTIAL_ACTION_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
}

export function isSensitiveInputDescriptor(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return SENSITIVE_INPUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildLocatorFromTarget(page: Page, target: ElementTarget): Locator {
  const exact = Boolean(target.exact);
  switch (target.strategy) {
    case 'role':
      return page.getByRole(target.role || 'button', {
        name: target.value,
        exact,
      });
    case 'label':
      return page.getByLabel(target.value, { exact });
    case 'placeholder':
      return page.getByPlaceholder(target.value, { exact });
    case 'text':
      return page.getByText(target.value, { exact });
    case 'testid':
      return page.getByTestId(target.value);
  }
}

function formatTargetDescription(target: ElementTarget): string {
  if (target.strategy === 'role') {
    return `role=${target.role}[name="${target.value}"]`;
  }
  return `${target.strategy}="${target.value}"`;
}

async function resolveActionableLocator(
  page: Page,
  target: ElementTarget
): Promise<
  | {
      ok: true;
      locator: Locator;
      elementInfo: {
        tagName: string;
        text: string;
        ariaLabel: string;
        id: string;
        name: string;
        type: string;
        autocomplete: string;
        dataConsequential: string;
        formHasConsequentialSubmit: boolean;
      };
    }
  | { ok: false; httpStatus: number; error: BrowserActionError }
> {
  const baseLocator = buildLocatorFromTarget(page, target);
  const count = await baseLocator.count();
  const targetDesc = formatTargetDescription(target);

  if (count === 0) {
    return {
      ok: false,
      httpStatus: 404,
      error: {
        code: 'ELEMENT_NOT_FOUND',
        message: `Target element (${targetDesc}) was not found on the current page.`,
      },
    };
  }

  const index = target.index ?? 0;
  if (index >= count) {
    return {
      ok: false,
      httpStatus: 404,
      error: {
        code: 'ELEMENT_NOT_FOUND',
        message: `Target element (${targetDesc}) matched ${count} element(s), so index ${index} does not exist.`,
      },
    };
  }

  const locator = baseLocator.nth(index);
  const isVisible = await locator.isVisible({ timeout: 2500 }).catch(() => false);
  if (!isVisible) {
    return {
      ok: false,
      httpStatus: 409,
      error: {
        code: 'ELEMENT_NOT_VISIBLE',
        message: `Target element (${targetDesc}) exists in the DOM but is not visible.`,
      },
    };
  }

  const isEnabled = await locator.isEnabled({ timeout: 2500 }).catch(() => false);
  if (!isEnabled) {
    return {
      ok: false,
      httpStatus: 409,
      error: {
        code: 'ELEMENT_DISABLED',
        message: `Target element (${targetDesc}) is disabled and cannot be interacted with.`,
      },
    };
  }

  const elementInfo = await locator.evaluate((el) => {
    const htmlEl = el as HTMLElement;
    const inputEl = el as HTMLInputElement;
    const form = htmlEl.closest('form');
    let formText = '';
    if (form) {
      const submitBtns = Array.from(
        form.querySelectorAll(
          'button, input[type="submit"], [role="button"]'
        )
      );
      formText = submitBtns
        .map(
          (b) =>
            (b as HTMLElement).innerText ||
            b.getAttribute('value') ||
            b.getAttribute('aria-label') ||
            ''
        )
        .join(' ');
    }

    return {
      tagName: el.tagName.toLowerCase(),
      text: (
        htmlEl.innerText ||
        inputEl.value ||
        el.textContent ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 250),
      ariaLabel: (el.getAttribute('aria-label') || '').trim().slice(0, 200),
      id: (el.getAttribute('id') || '').trim().slice(0, 120),
      name: (el.getAttribute('name') || '').trim().slice(0, 120),
      type: (el.getAttribute('type') || '').toLowerCase().trim().slice(0, 60),
      autocomplete: (el.getAttribute('autocomplete') || '')
        .toLowerCase()
        .trim()
        .slice(0, 60),
      dataConsequential: (el.getAttribute('data-consequential') || '')
        .toLowerCase()
        .trim(),
      formSubmitText: formText.replace(/\s+/g, ' ').trim().slice(0, 300),
    };
  });

  const formHasConsequentialSubmit = isConsequentialText(
    elementInfo.formSubmitText
  );

  return {
    ok: true,
    locator,
    elementInfo: {
      tagName: elementInfo.tagName,
      text: elementInfo.text,
      ariaLabel: elementInfo.ariaLabel,
      id: elementInfo.id,
      name: elementInfo.name,
      type: elementInfo.type,
      autocomplete: elementInfo.autocomplete,
      dataConsequential: elementInfo.dataConsequential,
      formHasConsequentialSubmit,
    },
  };
}

async function readVerificationStatusFromDom(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const el = document.getElementById('interaction-output');
      return el && el.textContent ? el.textContent.trim().slice(0, 300) : null;
    })
    .catch(() => null);
}

async function performInspectPage(page: Page): Promise<PageInspectionResult> {
  const pageTitle = await page.title();
  const currentUrl = page.url();
  const viewport = page.viewportSize();

  // Pass a string expression to page.evaluate so tsx/esbuild never injects Node-side __name helpers into the browser context
  const rawExtracted = (await page.evaluate(`(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const norm = (str, maxLen = 200) =>
      (str || '').replace(/\\s+/g, ' ').trim().slice(0, maxLen);

    const headingEls = Array.from(document.querySelectorAll('h1, h2, h3, h4')).filter(isVisible);
    const headings = headingEls
      .map((el) => ({
        level: Number(el.tagName.slice(1)) || 1,
        text: norm(el.textContent, 180),
      }))
      .filter((h) => h.text.length > 0)
      .slice(0, 15);

    const firstH1 = headings.find((h) => h.level === 1);
    const mainHeading = firstH1 ? firstH1.text : headings.length > 0 ? headings[0].text : null;

    const visibleText = norm(document.body ? document.body.innerText : '', 1400);

    const linkEls = Array.from(document.querySelectorAll('a[href]')).filter(isVisible);
    const links = linkEls
      .map((anchor) => {
        let cleanHref = anchor.href || anchor.getAttribute('href') || '';
        try {
          const u = new URL(cleanHref, window.location.href);
          u.username = '';
          u.password = '';
          cleanHref = u.toString();
        } catch (_e) {}
        return {
          text: norm(anchor.innerText || anchor.getAttribute('aria-label'), 120),
          href: cleanHref.slice(0, 300),
          ariaLabel: anchor.getAttribute('aria-label')
            ? norm(anchor.getAttribute('aria-label'), 120)
            : null,
        };
      })
      .filter((l) => l.text.length > 0 || l.href.length > 0)
      .slice(0, 25);

    const buttonEls = Array.from(
      document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]')
    ).filter(isVisible);
    const buttons = buttonEls
      .map((el) => {
        const text = norm(
          el.innerText || el.value || el.getAttribute('aria-label') || el.textContent,
          120
        );
        const ariaLabel = el.getAttribute('aria-label')
          ? norm(el.getAttribute('aria-label'), 120)
          : null;
        const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
        const dataConsequential = el.getAttribute('data-consequential') === 'true';
        return {
          text,
          role: el.getAttribute('role') || 'button',
          ariaLabel,
          disabled,
          dataConsequential,
        };
      })
      .filter((b) => b.text.length > 0 || b.ariaLabel)
      .slice(0, 25);

    const inputEls = Array.from(
      document.querySelectorAll('input:not([type="hidden"]), textarea, select')
    ).filter(isVisible);
    const inputs = inputEls
      .map((el) => {
        const id = el.getAttribute('id');
        let labelText = null;
        if (id) {
          const explicitLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]');
          if (explicitLabel) {
            labelText = norm(explicitLabel.textContent, 120);
          }
        }
        if (!labelText) {
          const wrappingLabel = el.closest('label');
          if (wrappingLabel) {
            labelText = norm(wrappingLabel.textContent, 120);
          }
        }
        if (!labelText && el.getAttribute('aria-label')) {
          labelText = norm(el.getAttribute('aria-label'), 120);
        }

        const type = (
          el.getAttribute('type') ||
          (el.tagName.toLowerCase() === 'textarea'
            ? 'textarea'
            : el.tagName.toLowerCase() === 'select'
            ? 'select'
            : 'text')
        ).toLowerCase();

        const isSensitiveType =
          type === 'password' || (el.getAttribute('autocomplete') || '').includes('cc-');

        return {
          label: labelText || null,
          placeholder: el.getAttribute('placeholder')
            ? norm(el.getAttribute('placeholder'), 120)
            : null,
          name: el.getAttribute('name') ? norm(el.getAttribute('name'), 80) : null,
          type,
          role: el.getAttribute('role') || (type === 'search' ? 'searchbox' : 'textbox'),
          valuePreview: isSensitiveType ? '[REDACTED]' : norm(el.value, 100),
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true'),
          required: Boolean(el.required || el.getAttribute('aria-required') === 'true'),
        };
      })
      .slice(0, 25);

    const active = document.activeElement;
    let focusedElement = null;
    if (active && active !== document.body && active !== document.documentElement) {
      const activeId = active.getAttribute('id');
      let activeLabel = active.getAttribute('aria-label');
      if (!activeLabel && activeId) {
        const lbl = document.querySelector('label[for="' + CSS.escape(activeId) + '"]');
        if (lbl) activeLabel = lbl.textContent;
      }
      focusedElement = {
        tag: active.tagName.toLowerCase(),
        role: active.getAttribute('role'),
        label: activeLabel ? norm(activeLabel, 100) : null,
        text: norm(active.innerText || active.value || active.getAttribute('placeholder'), 100),
      };
    }

    const docEl = document.documentElement;
    const maxScrollY = Math.max(0, (docEl ? docEl.scrollHeight : 0) - window.innerHeight);

    return {
      mainHeading,
      headings,
      visibleText,
      links,
      buttons,
      inputs,
      focusedElement,
      scrollPosition: {
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY),
        maxScrollY: Math.round(maxScrollY),
      },
      documentReadyState: document.readyState,
    };
  })()`)) as {
    mainHeading: string | null;
    headings: Array<{ level: number; text: string }>;
    visibleText: string;
    links: Array<{ text: string; href: string; ariaLabel: string | null }>;
    buttons: Array<{
      text: string;
      role: string;
      ariaLabel: string | null;
      disabled: boolean;
      dataConsequential: boolean;
    }>;
    inputs: Array<{
      label: string | null;
      placeholder: string | null;
      name: string | null;
      type: string;
      role: string;
      valuePreview: string;
      disabled: boolean;
      required: boolean;
    }>;
    focusedElement: {
      tag: string;
      role: string | null;
      label: string | null;
      text: string | null;
    } | null;
    scrollPosition: {
      x: number;
      y: number;
      maxScrollY: number;
    };
    documentReadyState: string;
  };

  const enrichedButtons = rawExtracted.buttons.map((b) => ({
    text: b.text,
    role: b.role,
    ariaLabel: b.ariaLabel,
    disabled: b.disabled,
    isConsequential:
      b.dataConsequential ||
      isConsequentialText(b.text) ||
      isConsequentialText(b.ariaLabel || ''),
  }));

  // Deterministic summary strictly derived from extracted content
  const summaryParts: string[] = [];
  if (pageTitle) {
    summaryParts.push(`Title: "${pageTitle}".`);
  }
  if (rawExtracted.mainHeading) {
    summaryParts.push(`Main heading: "${rawExtracted.mainHeading}".`);
  }
  summaryParts.push(
    `Discovered ${rawExtracted.links.length} visible link(s), ${enrichedButtons.length} button(s), and ${rawExtracted.inputs.length} input field(s).`
  );
  if (rawExtracted.visibleText) {
    const snippet = rawExtracted.visibleText.slice(0, 220);
    summaryParts.push(
      `Content excerpt: "${snippet}${
        rawExtracted.visibleText.length > 220 ? '...' : ''
      }"`
    );
  }

  return {
    pageTitle,
    currentUrl,
    mainHeading: rawExtracted.mainHeading,
    headings: rawExtracted.headings,
    visibleText: rawExtracted.visibleText,
    conciseSummary: summaryParts.join(' '),
    links: rawExtracted.links,
    buttons: enrichedButtons,
    inputs: rawExtracted.inputs,
    interactionState: {
      focusedElement: rawExtracted.focusedElement,
      scrollPosition: rawExtracted.scrollPosition,
      viewport: viewport
        ? { width: viewport.width, height: viewport.height }
        : null,
      documentReadyState: rawExtracted.documentReadyState,
    },
  };
}

export async function executeBrowserAction(
  rawBody: unknown
): Promise<ActionExecutionResult> {
  // 1. Validate payload structure & parameters first
  const validation = validateActionRequest(rawBody);
  if (!validation.valid) {
    const snapshot = browserSessionManager.buildSnapshot();
    return {
      httpStatus: validation.httpStatus,
      body: {
        success: false,
        action: validation.action,
        sessionId: snapshot.sessionId,
        result: null,
        pageTitle: snapshot.pageTitle,
        currentUrl: snapshot.currentUrl,
        screenshotDataUrl: snapshot.screenshotDataUrl,
        timestamp: getTimestamp(),
        error: validation.error,
        session: snapshot,
      },
    };
  }

  const request = validation.request;

  // 2. Serialize execution against the single managed Playwright session
  return browserSessionManager.runExclusive(async () => {
    const active = browserSessionManager.getActiveSession();
    if (!active) {
      const snapshot = browserSessionManager.buildSnapshot();
      return {
        httpStatus: 409,
        body: {
          success: false,
          action: request.action,
          sessionId: null,
          result: null,
          pageTitle: null,
          currentUrl: null,
          screenshotDataUrl: null,
          timestamp: getTimestamp(),
          error: {
            code: 'NO_ACTIVE_SESSION',
            message:
              'Cannot execute browser action: No active Chromium session is connected. Start a browser session first.',
          },
          session: snapshot,
        },
      };
    }

    const { page, sessionId } = active;

    try {
      switch (request.action) {
        case 'navigate': {
          const urlCheck = await validateNavigationUrl(request.url, {
            approveOrigin: request.approveOrigin,
          });
          if (!urlCheck.valid) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: urlCheck.httpStatus,
              body: {
                success: false,
                action: 'navigate',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: urlCheck.approvalRequired,
                pendingOrigin: urlCheck.pendingOrigin,
                error: urlCheck.error,
                session: snapshot,
              },
            };
          }

          const previousSafeUrl = page.url();
          const targetUrlString = urlCheck.parsedUrl.toString();

          const response = await page.goto(targetUrlString, {
            waitUntil: 'domcontentloaded',
            timeout: 12000,
          });

          // Verify redirect chain and final destination URL against navigation safety rules
          const finalUrl = page.url();
          const redirected = response
            ? Boolean(response.request().redirectedFrom())
            : finalUrl !== targetUrlString;

          const postNavCheck = await validateNavigationUrl(finalUrl, {
            isRedirectCheck: true,
          });

          if (!postNavCheck.valid) {
            // Revert to previous safe URL so session doesn't remain on a forbidden redirect target
            await page
              .goto(previousSafeUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 6000,
              })
              .catch(() => {});
            const revertedSnapshot =
              await browserSessionManager.syncStateFromActivePage({
                captureScreenshot: true,
              });

            return {
              httpStatus: 403,
              body: {
                success: false,
                action: 'navigate',
                sessionId,
                result: null,
                pageTitle: revertedSnapshot.pageTitle,
                currentUrl: revertedSnapshot.currentUrl,
                screenshotDataUrl: revertedSnapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: postNavCheck.approvalRequired,
                pendingOrigin: postNavCheck.pendingOrigin,
                error: {
                  code: 'REDIRECT_BLOCKED',
                  message: `Navigation redirect to "${finalUrl}" was blocked by navigation safety policy: ${postNavCheck.error.message}`,
                },
                session: revertedSnapshot,
              },
            };
          }

          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const navResult: NavigateActionResult = {
            requestedUrl: targetUrlString,
            finalUrl: updatedSnapshot.currentUrl || finalUrl,
            httpStatus: response ? response.status() : null,
            pageTitle: updatedSnapshot.pageTitle || '',
            mainHeading: updatedSnapshot.extractedHeading,
            redirected,
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'navigate',
              sessionId,
              result: navResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'inspectPage': {
          const inspection = await performInspectPage(page);
          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: false,
            });

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'inspectPage',
              sessionId,
              result: inspection,
              pageTitle: inspection.pageTitle,
              currentUrl: inspection.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'captureScreenshot': {
          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const screenshotResult: CaptureScreenshotActionResult = {
            screenshotCount: updatedSnapshot.screenshotCount,
            capturedAt: updatedSnapshot.lastScreenshotAt || getTimestamp(),
            pageTitle: updatedSnapshot.pageTitle || '',
            currentUrl: updatedSnapshot.currentUrl || '',
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'captureScreenshot',
              sessionId,
              result: screenshotResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'click': {
          const targetDesc = formatTargetDescription(request.target);

          // Pre-check target value string for consequential keywords
          if (isConsequentialText(request.target.value)) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: 403,
              body: {
                success: false,
                action: 'click',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: true,
                error: {
                  code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                  message: `Consequential action blocked: Clicking "${request.target.value}" requires explicit human approval before execution.`,
                },
                session: snapshot,
              },
            };
          }

          const resolved = await resolveActionableLocator(page, request.target);
          if (!resolved.ok) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: resolved.httpStatus,
              body: {
                success: false,
                action: 'click',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                error: resolved.error,
                session: snapshot,
              },
            };
          }

          const { locator, elementInfo } = resolved;

          // Inspect resolved DOM element for consequential purchase/payment/financial attributes
          if (
            elementInfo.dataConsequential === 'true' ||
            isConsequentialText(elementInfo.text) ||
            isConsequentialText(elementInfo.ariaLabel) ||
            isConsequentialText(elementInfo.id) ||
            isConsequentialText(elementInfo.name) ||
            (elementInfo.type === 'submit' &&
              elementInfo.formHasConsequentialSubmit)
          ) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: 403,
              body: {
                success: false,
                action: 'click',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: true,
                error: {
                  code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                  message: `Consequential action blocked: Target control "${
                    elementInfo.text ||
                    elementInfo.ariaLabel ||
                    request.target.value
                  }" triggers a purchase, payment, or sensitive irreversible operation and requires human approval.`,
                },
                session: snapshot,
              },
            };
          }

          const urlBefore = page.url();
          await locator.click({ timeout: 5000 });
          await page
            .waitForLoadState('domcontentloaded', { timeout: 3000 })
            .catch(() => {});

          const urlAfter = page.url();
          if (urlAfter !== urlBefore) {
            const navSafety = await validateNavigationUrl(urlAfter, {
              isRedirectCheck: true,
            });
            if (!navSafety.valid) {
              await page
                .goto(urlBefore, {
                  waitUntil: 'domcontentloaded',
                  timeout: 6000,
                })
                .catch(() => {});
              const reverted =
                await browserSessionManager.syncStateFromActivePage({
                  captureScreenshot: true,
                });
              return {
                httpStatus: 403,
                body: {
                  success: false,
                  action: 'click',
                  sessionId,
                  result: null,
                  pageTitle: reverted.pageTitle,
                  currentUrl: reverted.currentUrl,
                  screenshotDataUrl: reverted.screenshotDataUrl,
                  timestamp: getTimestamp(),
                  approvalRequired: navSafety.approvalRequired,
                  pendingOrigin: navSafety.pendingOrigin,
                  error: navSafety.error,
                  session: reverted,
                },
              };
            }
          }

          const domStateVerification = await readVerificationStatusFromDom(page);
          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const clickResult: ClickActionResult = {
            targetDescription: targetDesc,
            matchedTag: elementInfo.tagName,
            matchedText: elementInfo.text || request.target.value,
            urlBefore,
            urlAfter: updatedSnapshot.currentUrl || urlAfter,
            urlChanged: urlBefore !== (updatedSnapshot.currentUrl || urlAfter),
            titleAfter: updatedSnapshot.pageTitle || '',
            domStateVerification,
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'click',
              sessionId,
              result: clickResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'fill': {
          const targetDesc = formatTargetDescription(request.target);

          // Check target descriptor for sensitive payment/credential fields
          if (isSensitiveInputDescriptor(request.target.value)) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: 403,
              body: {
                success: false,
                action: 'fill',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: true,
                error: {
                  code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                  message: `Consequential action blocked: Filling payment or credential field "${request.target.value}" is restricted and requires explicit human approval.`,
                },
                session: snapshot,
              },
            };
          }

          const resolved = await resolveActionableLocator(page, request.target);
          if (!resolved.ok) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: resolved.httpStatus,
              body: {
                success: false,
                action: 'fill',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                error: resolved.error,
                session: snapshot,
              },
            };
          }

          const { locator, elementInfo } = resolved;

          if (
            elementInfo.type === 'password' ||
            elementInfo.dataConsequential === 'true' ||
            isSensitiveInputDescriptor(elementInfo.ariaLabel) ||
            isSensitiveInputDescriptor(elementInfo.name) ||
            isSensitiveInputDescriptor(elementInfo.id) ||
            isSensitiveInputDescriptor(elementInfo.autocomplete)
          ) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: 403,
              body: {
                success: false,
                action: 'fill',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                approvalRequired: true,
                error: {
                  code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                  message:
                    'Consequential action blocked: Automated filling of password, payment card, or financial credential fields is prohibited.',
                },
                session: snapshot,
              },
            };
          }

          const isEditable = await locator
            .isEditable({ timeout: 2500 })
            .catch(() => false);
          if (!isEditable) {
            const snapshot = browserSessionManager.buildSnapshot();
            return {
              httpStatus: 409,
              body: {
                success: false,
                action: 'fill',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                error: {
                  code: 'ELEMENT_NOT_EDITABLE',
                  message: `Target element (${targetDesc}) is not an editable text field.`,
                },
                session: snapshot,
              },
            };
          }

          await locator.fill(request.value, { timeout: 5000 });

          // Verify actual input value from the live DOM
          const verifiedInputValue = await locator.inputValue({ timeout: 2500 });
          if (verifiedInputValue !== request.value) {
            const snapshot =
              await browserSessionManager.syncStateFromActivePage({
                captureScreenshot: true,
              });
            return {
              httpStatus: 422,
              body: {
                success: false,
                action: 'fill',
                sessionId,
                result: null,
                pageTitle: snapshot.pageTitle,
                currentUrl: snapshot.currentUrl,
                screenshotDataUrl: snapshot.screenshotDataUrl,
                timestamp: getTimestamp(),
                error: {
                  code: 'VERIFICATION_FAILED',
                  message: `DOM verification failed: Expected input value "${request.value}", but actual field value was "${verifiedInputValue}".`,
                },
                session: snapshot,
              },
            };
          }

          const domStateVerification = await readVerificationStatusFromDom(page);
          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const fillResult: FillActionResult = {
            targetDescription: targetDesc,
            matchedTag: elementInfo.tagName,
            verifiedInputValue,
            valueLength: verifiedInputValue.length,
            domStateVerification,
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'fill',
              sessionId,
              result: fillResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'scroll': {
          const amount = request.amount ?? 360;
          const scrollMetrics = await page.evaluate(
            ({ dir, pixels }) => {
              const docEl = document.documentElement;
              const maxScrollY = Math.max(
                0,
                (docEl ? docEl.scrollHeight : 0) - window.innerHeight
              );
              const previousScrollY = Math.round(window.scrollY);

              if (dir === 'down') {
                window.scrollBy({ top: pixels, left: 0, behavior: 'instant' });
              } else if (dir === 'up') {
                window.scrollBy({ top: -pixels, left: 0, behavior: 'instant' });
              } else if (dir === 'top') {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              } else if (dir === 'bottom') {
                window.scrollTo({
                  top: maxScrollY,
                  left: 0,
                  behavior: 'instant',
                });
              }

              const currentScrollY = Math.round(window.scrollY);
              return {
                previousScrollY,
                currentScrollY,
                maxScrollY: Math.round(maxScrollY),
                scrolledDeltaY: currentScrollY - previousScrollY,
              };
            },
            { dir: request.direction, pixels: amount }
          );

          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const scrollResult: ScrollActionResult = {
            direction: request.direction,
            previousScrollY: scrollMetrics.previousScrollY,
            currentScrollY: scrollMetrics.currentScrollY,
            maxScrollY: scrollMetrics.maxScrollY,
            scrolledDeltaY: scrollMetrics.scrolledDeltaY,
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'scroll',
              sessionId,
              result: scrollResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }

        case 'pressKey': {
          // If an explicit target was supplied, resolve & focus it first
          if (request.target) {
            if (isConsequentialText(request.target.value)) {
              const snapshot = browserSessionManager.buildSnapshot();
              return {
                httpStatus: 403,
                body: {
                  success: false,
                  action: 'pressKey',
                  sessionId,
                  result: null,
                  pageTitle: snapshot.pageTitle,
                  currentUrl: snapshot.currentUrl,
                  screenshotDataUrl: snapshot.screenshotDataUrl,
                  timestamp: getTimestamp(),
                  approvalRequired: true,
                  error: {
                    code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                    message: `Consequential action blocked: Keyboard interaction on "${request.target.value}" requires human approval.`,
                  },
                  session: snapshot,
                },
              };
            }

            const resolved = await resolveActionableLocator(
              page,
              request.target
            );
            if (!resolved.ok) {
              const snapshot = browserSessionManager.buildSnapshot();
              return {
                httpStatus: resolved.httpStatus,
                body: {
                  success: false,
                  action: 'pressKey',
                  sessionId,
                  result: null,
                  pageTitle: snapshot.pageTitle,
                  currentUrl: snapshot.currentUrl,
                  screenshotDataUrl: snapshot.screenshotDataUrl,
                  timestamp: getTimestamp(),
                  error: resolved.error,
                  session: snapshot,
                },
              };
            }
            await resolved.locator.focus({ timeout: 3000 });
          }

          // Inspect currently focused element before pressing key (especially Enter / Space)
          const activeBefore = await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            if (!el || el === document.body) {
              return {
                desc: 'body',
                text: '',
                ariaLabel: '',
                dataConsequential: '',
                formSubmitText: '',
              };
            }
            const form = el.closest('form');
            let formSubmitText = '';
            if (form) {
              const submitBtns = Array.from(
                form.querySelectorAll(
                  'button, input[type="submit"], [role="button"]'
                )
              );
              formSubmitText = submitBtns
                .map(
                  (b) =>
                    (b as HTMLElement).innerText ||
                    b.getAttribute('value') ||
                    b.getAttribute('aria-label') ||
                    ''
                )
                .join(' ');
            }
            const tag = el.tagName.toLowerCase();
            const id = el.getAttribute('id');
            return {
              desc: id ? `${tag}#${id}` : tag,
              text: (el.innerText || (el as HTMLInputElement).value || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 200),
              ariaLabel: (el.getAttribute('aria-label') || '').trim(),
              dataConsequential: (
                el.getAttribute('data-consequential') || ''
              ).toLowerCase(),
              formSubmitText: formSubmitText
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 300),
            };
          });

          if (request.key === 'Enter' || request.key === 'Space') {
            if (
              activeBefore.dataConsequential === 'true' ||
              isConsequentialText(activeBefore.text) ||
              isConsequentialText(activeBefore.ariaLabel) ||
              isConsequentialText(activeBefore.formSubmitText)
            ) {
              const snapshot = browserSessionManager.buildSnapshot();
              return {
                httpStatus: 403,
                body: {
                  success: false,
                  action: 'pressKey',
                  sessionId,
                  result: null,
                  pageTitle: snapshot.pageTitle,
                  currentUrl: snapshot.currentUrl,
                  screenshotDataUrl: snapshot.screenshotDataUrl,
                  timestamp: getTimestamp(),
                  approvalRequired: true,
                  error: {
                    code: 'CONSEQUENTIAL_ACTION_BLOCKED',
                    message: `Consequential action blocked: Pressing "${request.key}" on a payment, purchase, or financial control requires explicit human approval.`,
                  },
                  session: snapshot,
                },
              };
            }
          }

          await page.keyboard.press(request.key);

          const activeAfter = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return 'body';
            const tag = el.tagName.toLowerCase();
            const id = el.getAttribute('id');
            return id ? `${tag}#${id}` : tag;
          });

          const domStateVerification = await readVerificationStatusFromDom(page);
          const updatedSnapshot =
            await browserSessionManager.syncStateFromActivePage({
              captureScreenshot: true,
            });

          const keyResult: PressKeyActionResult = {
            key: request.key,
            focusedElementBefore: activeBefore.desc,
            focusedElementAfter: activeAfter,
            urlAfter: updatedSnapshot.currentUrl || page.url(),
            domStateVerification,
          };

          return {
            httpStatus: 200,
            body: {
              success: true,
              action: 'pressKey',
              sessionId,
              result: keyResult,
              pageTitle: updatedSnapshot.pageTitle,
              currentUrl: updatedSnapshot.currentUrl,
              screenshotDataUrl: updatedSnapshot.screenshotDataUrl,
              timestamp: getTimestamp(),
              session: updatedSnapshot,
            },
          };
        }
      }
    } catch (err: unknown) {
      const sanitizedMsg = browserSessionManager.sanitizeError(err);
      const snapshot = await browserSessionManager
        .syncStateFromActivePage({ captureScreenshot: false })
        .catch(() => browserSessionManager.buildSnapshot());

      return {
        httpStatus: 500,
        body: {
          success: false,
          action: request.action,
          sessionId: snapshot.sessionId,
          result: null,
          pageTitle: snapshot.pageTitle,
          currentUrl: snapshot.currentUrl,
          screenshotDataUrl: snapshot.screenshotDataUrl,
          timestamp: getTimestamp(),
          error: {
            code: 'ACTION_EXECUTION_FAILED',
            message: `Playwright action "${request.action}" failed: ${sanitizedMsg}`,
          },
          session: snapshot,
        },
      };
    }
  });
}
