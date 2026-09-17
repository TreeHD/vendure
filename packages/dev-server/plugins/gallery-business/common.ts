import { Injectable } from '@nestjs/common';
import { Administrator, CustomerService, ForbiddenError, ID, ProductService, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { createHash, randomBytes } from 'node:crypto';
import { GalleryChannelEntity } from './entities';
import { ObjectType } from 'typeorm';

export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
/**
 * Keep an identifiable, stable prefix for clients while returning a message that can be shown
 * to an administrator or customer without requiring a separate error-code lookup table.
 */
const errorMessages: Record<string, string> = {
    ADMIN_REQUIRED: '此操作只允許管理員執行。',
    ARTIST_NOT_FOUND: '找不到指定的藝術家，或該藝術家尚未發布。',
    ARTIST_REQUIRED: '事件類型為藝術家瀏覽時，必須提供 artistId。',
    ARTWORK_NOT_FOUND: '找不到指定作品，或作品已停用、刪除，或不屬於目前頻道。',
    ARTWORK_RESERVED: '此作品已保留給另一筆私人洽購案件，暫時不能建立新的付款邀請。',
    ASSET_NOT_FOUND: '指定媒體資產不存在，或目前頻道無權使用它。',
    BOTH_LANGUAGES_REQUIRED: '必須同時提供繁體中文（zh_Hant）與英文（en）兩種翻譯。',
    CASE_NOT_PAYABLE: '案件目前不是付款中狀態，無法建立或開啟付款頁。',
    CONTACT_GALLERY_TO_CANCEL: '此案件目前不能由客戶自行取消；請聯絡畫廊協助處理。',
    CONTENT_KIND_MISMATCH: '內容 ID 所屬的內容類型與本次操作的類型不同。',
    CONTENT_TOO_DEEP: '內容 JSON 巢狀超過 12 層，請簡化內容結構。',
    DEADLINE_TOO_SOON: '付款截止時間必須至少在現在起 30 分鐘後。',
    DEPOSIT_MUST_BE_LESS_THAN_TOTAL: '訂金金額必須小於報價總額。',
    DEPOSIT_REQUIRED: '建立尾款付款前，訂金必須已完成付款且未退款。',
    INVALID_BALANCE_DEADLINE: '尾款截止時間必須晚於訂金截止時間。',
    INVALID_BLOCK_TYPE: '內容包含不支援的區塊類型；只允許 hero、text、image、gallery、links、steps、faq、video。',
    INVALID_CASE_STATE: '案件必須處於已提案或付款中狀態，才能建立付款邀請。',
    INVALID_CASE_TRANSITION: '案件無法從目前狀態轉換到指定狀態。',
    INVALID_CLAIM_TOKEN: '認領連結無效、已過期、已使用，或帳號電子郵件不符合案件資料。',
    INVALID_CONTENT: '內容必須是大小不超過 200 KB 的 JSON 物件，不能是陣列或空值。',
    INVALID_CONTENT_KEY: '內容 key 只能使用小寫英數、底線、斜線與連字號，且必須以英數字開頭。',
    INVALID_DATE: '日期格式無效，請傳送可解析的 ISO 8601 日期時間。',
    INVALID_DEADLINE: '截止時間必須是未來的有效日期時間。',
    INVALID_IMAGE_ASSET: '圖片節點必須提供目前頻道可使用的有效 assetId。',
    INVALID_LINK: '連結只允許站內路徑、https://、mailto: 或 tel:。',
    INVALID_METADATA: 'metadata 必須是小於 2 KB 的物件，且不能含有密碼、權杖、卡號、電子郵件或電話等敏感資料。',
    INVALID_PATH: '路徑必須為單一站內絕對路徑，不能使用 //、反斜線、查詢字串或 fragment。',
    INVALID_PAYMENT: '付款資料與訂單、案件或允許金額不一致，無法驗證。',
    INVALID_PAYMENT_TOKEN: '付款連結無效或已失效，請向畫廊索取新的付款邀請。',
    INVALID_RECIPIENTS: '指定收件者必須是目前頻道中的有效客戶；ALL 類型不能指定收件者。',
    INVALID_STAGE: '付款階段只能是 deposit（訂金）或 balance（尾款）。',
    INVALID_TRANSITION: '此狀態轉換不被允許。',
    INVALID_VISITOR_TOKEN: '訪客識別碼無效或簽章不正確，請重新取得訪客識別碼。',
    NO_PAYMENT_TO_REFUND: '此付款請求尚未完成付款，沒有可退款的款項。',
    NOT_FOUND: '找不到指定資料，或資料不屬於目前頻道／帳號。',
    ORDER_AMOUNT_MISMATCH: '系統建立的訂單金額與已核准的報價金額不一致。',
    ORDER_CHANGED: '訂單金額或幣別已變更，原付款邀請不可再使用，請重新建立付款邀請。',
    PAYMENT_INCOMPLETE: '只有在案件付款完成、無未退款項目且總額大於零時，才能確認交付。',
    PAYMENT_INTENT_MISSING: 'Stripe webhook 未包含 Payment Intent，無法確認款項。',
    PAYMENT_PROCESSING: 'Stripe 正在處理或已完成此筆付款，請稍後刷新案件狀態。',
    PAYMENT_RECORD_MISSING: '已收到 Stripe 付款，但找不到對應的 Vendure 付款紀錄，需由管理員核對。',
    PAYMENT_REQUEST_NOT_PAYABLE: '付款邀請已過期、撤銷、完成或不在可付款狀態。',
    PAYMENT_VERIFICATION_FAILED: 'Stripe Payment Intent 的狀態、金額、幣別或付款請求 ID 驗證不符。',
    PRODUCT_REQUIRED: '此操作需要提供 productId。',
    PROPOSAL_NOT_EDITABLE: '只有「已聯絡」或「已提案」且尚未建立訂單的案件可以建立或修改報價。',
    PROPOSAL_REQUIRED: '必須先建立有效報價，才能建立付款邀請。',
    PUBLISHED_NOTIFICATION_IMMUTABLE: '通知已發布，不能再編輯；請建立新的草稿通知。',
    REFUND_PENDING_RECONCILIATION: 'Stripe 退款尚未成功完成，請稍後核對 Stripe 後再繼續。',
    REFUND_REQUIRED: '此付款請求已有付款紀錄，必須先退款，不能直接撤銷。',
    RESERVATION_REQUIRED: '找不到此案件的作品保留紀錄，無法繼續付款。',
    REVOKE_AND_REFUND_BEFORE_CANCELLING: '取消案件前，必須先撤銷未付款邀請，並完成已付款項目的退款。',
    STAGE_ALREADY_EXISTS: '此案件的同一付款階段已有未結束或已付款的付款邀請。',
    STAGE_ALREADY_PAID: '此付款階段已完成付款，不能重新發送付款邀請。',
    STRIPE_NOT_CONFIGURED: '伺服器尚未設定有效的 STRIPE_SECRET_KEY，無法處理信用卡付款。',
    TRANSLATIONS_REQUIRED: '內容必須至少包含一筆翻譯資料。',
    UNSAFE_CONTENT: '內容含有不安全的 HTML、事件處理器或 javascript: 連結，已被拒絕。',
    USE_CASE_ACTION: '此狀態只能透過建立報價、建立付款邀請或確認交付等對應操作變更。',
    VERIFIED_ACCOUNT_REQUIRED: '請使用已驗證電子郵件的會員帳號登入後再認領案件。',
    VISITOR_SIGNING_NOT_CONFIGURED: '伺服器未設定 VENDURE_COOKIE_SECRET，無法簽發訪客識別碼。',
    VISITOR_TOKEN_REQUIRED: '請登入會員帳號，或提供有效的 visitorToken，才能記錄此行為。',
    WEBHOOK_AMOUNT_MISMATCH: 'Stripe webhook 的付款金額或幣別與付款請求不一致。',
    WEBHOOK_PAYMENT_ONLY: '此付款驗證只能由受信任的 Stripe webhook 在 Admin API 流程中執行。',
    WEBHOOK_REQUEST_MISMATCH: 'Stripe webhook 的頻道或 Checkout Session 與付款請求不一致。',
};

const fieldLabels: Record<string, string> = {
    NAME: '姓名', EMAIL: '電子郵件', PHONE: '電話', SUBJECT: '主旨', MESSAGE: '訊息', NOTE: '內部備註',
    SUMMARY: '報價摘要', REASON: '原因', TOKEN: '權杖', PATH: '路徑', KEY: '內容 key',
    TITLE: '標題', BODY: '內文', CATEGORY: '分類', STOREFRONT_URL: '商店前台網址',
    INQUIRY_TYPE: '詢價類型', LANGUAGE: '語言', STATUS: '狀態', CONTACT_METHOD: '聯絡方式',
    EVENT_TYPE: '事件類型', STAGE: '階段', AUDIENCE: '通知對象',
};

export function galleryError(code: string, detail?: string): UserInputError {
    const field = code.startsWith('INVALID_') ? fieldLabels[code.slice('INVALID_'.length)] : undefined;
    const message = detail || errorMessages[code] || (field ? `${field}格式不正確、不可空白，或超過允許長度。` : '請檢查輸入資料與目前資源狀態後再試一次。');
    return new UserInputError(`[${code}] ${message}`);
}

export function galleryUpstreamError(action: string, error: unknown): UserInputError {
    const code = typeof error === 'string' ? error : 'UNKNOWN';
    return galleryError(`VENDURE_${code}`, `${action}失敗（Vendure 回傳：${code}）。請檢查相關資料與狀態後重試。`);
}
export function required(value: unknown, field: string, max = 4000): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw galleryError(`INVALID_${field.toUpperCase()}`);
    return value.trim();
}
export function email(value: unknown) {
    const result = required(value, 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw galleryError('INVALID_EMAIL', '電子郵件格式不正確，例如 name@example.com。');
    return result;
}
export function choice(value: string, values: string[], field: string) {
    if (!values.includes(value)) throw galleryError(`INVALID_${field}`, `${fieldLabels[field] || field}無效；允許值為：${values.join('、')}。`);
    return value;
}
export function money(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_000_000_000) throw galleryError('INVALID_AMOUNT', '金額必須是大於 0、且不超過 2,000,000,000 的整數（最小貨幣單位）。');
    return value;
}
export function future(value: string | Date) {
    const result = new Date(value);
    if (!Number.isFinite(+result) || +result <= Date.now()) throw galleryError('INVALID_DEADLINE');
    return result;
}
export function safePath(value = '') {
    if (!value) return '';
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.length > 2048) throw galleryError('INVALID_PATH');
    return value.split(/[?#]/)[0];
}
export interface ListOptions { skip?: number; take?: number; status?: string; search?: string; kind?: string; }
@Injectable()
export class GalleryAccess {
    constructor(public connection: TransactionalConnection, private customers: CustomerService, private products: ProductService) {}
    repo<T extends GalleryChannelEntity>(ctx: RequestContext, entity: ObjectType<T>) { return this.connection.getRepository(ctx, entity); }
    async customer(ctx: RequestContext, optional = false) {
        const customer = ctx.activeUserId ? await this.customers.findOneByUserId(ctx, ctx.activeUserId) : undefined;
        if (!customer && !optional) throw new ForbiddenError();
        return customer;
    }
    async find<T extends GalleryChannelEntity>(ctx: RequestContext, entity: ObjectType<T>, id: ID, lock = false): Promise<T> {
        const query = this.repo(ctx, entity).createQueryBuilder('e').where('e.id = :id AND e.channelId = :channelId', { id, channelId: ctx.channelId });
        if (lock && this.connection.rawConnection.options.type === 'postgres') query.setLock('pessimistic_write');
        const result = await query.getOne();
        if (!result) throw galleryError('NOT_FOUND');
        return result;
    }
    async list<T extends GalleryChannelEntity>(ctx: RequestContext, entity: ObjectType<T>, options: ListOptions = {}, fields: string[] = []) {
        const query = this.repo(ctx, entity).createQueryBuilder('e').where('e.channelId = :channelId', { channelId: ctx.channelId });
        if (options.status) query.andWhere('e.status = :status', { status: options.status });
        if (options.search && fields.length) query.andWhere(`(${fields.map(field => `LOWER(e.${field}) LIKE :term`).join(' OR ')})`, { term: `%${options.search.slice(0,200).toLowerCase()}%` });
        if (options.kind) query.andWhere('e.kind = :kind', { kind: options.kind });
        const [items, totalItems] = await query.orderBy('e.createdAt', 'DESC').addOrderBy('e.id', 'DESC').skip(Math.max(0, options.skip || 0)).take(Math.min(100, Math.max(1, options.take || 20))).getManyAndCount();
        return { items, totalItems };
    }
    async assignee(ctx: RequestContext, id: ID | null | undefined) {
        if (id == null) return id;
        const admin = await this.connection.getRepository(ctx, Administrator).findOne({ where: { id }, relations: ['user', 'user.roles', 'user.roles.channels'] });
        if (!admin || admin.deletedAt || !admin.user.roles.some(role => role.channels.some(channel => String(channel.id) === String(ctx.channelId)))) throw galleryError('INVALID_ASSIGNEE', '指派的管理員不存在、已刪除，或未被授權至目前頻道。');
        return id;
    }
    async product(ctx: RequestContext, id: ID) {
        const product = await this.products.findOne(ctx, id);
        if (!product || !product.enabled || product.deletedAt) throw galleryError('ARTWORK_NOT_FOUND');
        return product;
    }
}
