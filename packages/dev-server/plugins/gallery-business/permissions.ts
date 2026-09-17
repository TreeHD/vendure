import { PermissionDefinition } from '@vendure/core';
export const ReadGallerySales = new PermissionDefinition({name:'ReadGallerySales',description:'讀取藝廊案件'});
export const ManageGallerySales = new PermissionDefinition({name:'ManageGallerySales',description:'管理藝廊案件'});
export const ManageGalleryPayments = new PermissionDefinition({name:'ManageGalleryPayments',description:'管理付款與退款'});
export const ManageGalleryContent = new PermissionDefinition({name:'ManageGalleryContent',description:'管理藝廊內容與通知'});
export const ManageGalleryCrm = new PermissionDefinition({name:'ManageGalleryCrm',description:'管理 CRM 與統計'});
export const ManageGalleryMembership = new PermissionDefinition({name:'ManageGalleryMembership',description:'管理會員資格'});
export const businessPermissions=[ReadGallerySales,ManageGallerySales,ManageGalleryPayments,ManageGalleryContent,ManageGalleryCrm,ManageGalleryMembership];
