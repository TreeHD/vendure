export type CmsArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** The persisted, canonical TipTap document shape. */
export type ContentDocument = {
    type: 'doc';
    content?: ContentNode[];
};

export type ContentNode = {
    type: string;
    attrs?: Record<string, unknown>;
    content?: ContentNode[];
    text?: string;
    marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};
