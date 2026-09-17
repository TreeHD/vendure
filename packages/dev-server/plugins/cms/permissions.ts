import { PermissionDefinition } from '@vendure/core';

export const ReadCms = new PermissionDefinition({ name: 'ReadCms', description: 'Read CMS content' });
export const UpdateCms = new PermissionDefinition({
    name: 'UpdateCms',
    description: 'Create and edit CMS content',
});
export const PublishCms = new PermissionDefinition({
    name: 'PublishCms',
    description: 'Publish CMS content',
});
export const DeleteCms = new PermissionDefinition({ name: 'DeleteCms', description: 'Delete CMS content' });

export const cmsPermissions = [ReadCms, UpdateCms, PublishCms, DeleteCms];
