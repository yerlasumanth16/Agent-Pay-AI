import type { ManagedBrowserSessionInfo } from './browserHealth.js';

export type BrowserActionType =
  | 'navigate'
  | 'inspectPage'
  | 'click'
  | 'fill'
  | 'scroll'
  | 'pressKey'
  | 'captureScreenshot';

export type LocatorStrategy =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'testid';

export type SupportedAriaRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'searchbox'
  | 'checkbox'
  | 'radio'
  | 'combobox'
  | 'tab'
  | 'menuitem'
  | 'heading';

export interface ElementTarget {
  strategy: LocatorStrategy;
  value: string;
  role?: SupportedAriaRole;
  exact?: boolean;
  index?: number;
}

export type ScrollDirection = 'up' | 'down' | 'top' | 'bottom';

export type AllowedKey =
  | 'Enter'
  | 'Tab'
  | 'Escape'
  | 'Backspace'
  | 'Delete'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'Space';

export interface NavigateActionPayload {
  action: 'navigate';
  url: string;
  approveOrigin?: boolean;
}

export interface InspectPageActionPayload {
  action: 'inspectPage';
}

export interface ClickActionPayload {
  action: 'click';
  target: ElementTarget;
}

export interface FillActionPayload {
  action: 'fill';
  target: ElementTarget;
  value: string;
}

export interface ScrollActionPayload {
  action: 'scroll';
  direction: ScrollDirection;
  amount?: number;
}

export interface PressKeyActionPayload {
  action: 'pressKey';
  key: string;
  target?: ElementTarget;
}

export interface CaptureScreenshotActionPayload {
  action: 'captureScreenshot';
}

export type BrowserActionRequest =
  | NavigateActionPayload
  | InspectPageActionPayload
  | ClickActionPayload
  | FillActionPayload
  | ScrollActionPayload
  | PressKeyActionPayload
  | CaptureScreenshotActionPayload;

export interface InspectedLink {
  text: string;
  href: string;
  ariaLabel: string | null;
}

export interface InspectedButton {
  text: string;
  role: string;
  ariaLabel: string | null;
  disabled: boolean;
  isConsequential: boolean;
}

export interface InspectedInput {
  label: string | null;
  placeholder: string | null;
  name: string | null;
  type: string;
  role: string;
  valuePreview: string;
  disabled: boolean;
  required: boolean;
}

export interface PageInspectionResult {
  pageTitle: string;
  currentUrl: string;
  mainHeading: string | null;
  headings: Array<{ level: number; text: string }>;
  visibleText: string;
  conciseSummary: string;
  links: InspectedLink[];
  buttons: InspectedButton[];
  inputs: InspectedInput[];
  interactionState: {
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
    viewport: {
      width: number;
      height: number;
    } | null;
    documentReadyState: string;
  };
}

export interface NavigateActionResult {
  requestedUrl: string;
  finalUrl: string;
  httpStatus: number | null;
  pageTitle: string;
  mainHeading: string | null;
  redirected: boolean;
}

export interface ClickActionResult {
  targetDescription: string;
  matchedTag: string;
  matchedText: string;
  urlBefore: string;
  urlAfter: string;
  urlChanged: boolean;
  titleAfter: string;
  domStateVerification: string | null;
}

export interface FillActionResult {
  targetDescription: string;
  matchedTag: string;
  verifiedInputValue: string;
  valueLength: number;
  domStateVerification: string | null;
}

export interface ScrollActionResult {
  direction: ScrollDirection;
  previousScrollY: number;
  currentScrollY: number;
  maxScrollY: number;
  scrolledDeltaY: number;
}

export interface PressKeyActionResult {
  key: string;
  focusedElementBefore: string | null;
  focusedElementAfter: string | null;
  urlAfter: string;
  domStateVerification: string | null;
}

export interface CaptureScreenshotActionResult {
  screenshotCount: number;
  capturedAt: string;
  pageTitle: string;
  currentUrl: string;
}

export type BrowserActionResultData =
  | PageInspectionResult
  | NavigateActionResult
  | ClickActionResult
  | FillActionResult
  | ScrollActionResult
  | PressKeyActionResult
  | CaptureScreenshotActionResult;

export interface BrowserActionError {
  code:
    | 'NO_ACTIVE_SESSION'
    | 'INVALID_ACTION_TYPE'
    | 'MALFORMED_PAYLOAD'
    | 'INVALID_LOCATOR_STRATEGY'
    | 'MALFORMED_URL'
    | 'DISALLOWED_SCHEME'
    | 'EMBEDDED_CREDENTIALS_NOT_ALLOWED'
    | 'PROHIBITED_NETWORK_DESTINATION'
    | 'DOMAIN_PERMISSION_REQUIRED'
    | 'REDIRECT_BLOCKED'
    | 'ELEMENT_NOT_FOUND'
    | 'ELEMENT_NOT_VISIBLE'
    | 'ELEMENT_DISABLED'
    | 'ELEMENT_NOT_EDITABLE'
    | 'CONSEQUENTIAL_ACTION_BLOCKED'
    | 'ACTION_EXECUTION_FAILED'
    | 'VERIFICATION_FAILED';
  message: string;
  details?: string;
}

export interface BrowserActionResponse {
  success: boolean;
  action: string;
  sessionId: string | null;
  result: BrowserActionResultData | null;
  pageTitle: string | null;
  currentUrl: string | null;
  screenshotDataUrl: string | null;
  timestamp: string;
  approvalRequired?: boolean;
  pendingOrigin?: string;
  error?: BrowserActionError;
  session?: ManagedBrowserSessionInfo;
}
