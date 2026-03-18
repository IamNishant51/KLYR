import type { UiContextReference, UiDiffChange, UiPlan } from '../webview';
export declare function renderPlanCard(plan?: UiPlan): string;
export declare function renderContextReferences(references: UiContextReference[]): string;
export declare function renderDiffPreview(changes: UiDiffChange[]): string;
