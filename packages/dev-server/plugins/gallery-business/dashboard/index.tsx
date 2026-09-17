import { api } from '@vendure/dashboard';
import { Button, DashboardRouteDefinition, defineDashboardExtension } from '@vendure/dashboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Area = 'inquiries' | 'private-purchases' | 'payment-requests' | 'notifications' | 'content' | 'crm';

const labels: Record<Area, string> = {
    inquiries: '洽詢',
    'private-purchases': '私人洽購',
    'payment-requests': '付款邀請',
    notifications: '站內通知',
    content: '內容管理',
    crm: 'CRM',
};

const documents: Record<Area, string> = {
    inquiries: `query { inquiries(options:{take:100}) { items { id code type contactName emailAddress subject status createdAt } } }`,
    'private-purchases': `query { privatePurchases(options:{take:100}) { items { id code artworkTitle contactName status createdAt totalAmount paidAmount remainingAmount } } }`,
    'payment-requests': `query { paymentRequests(options:{take:100}) { items { id purchaseId stage amount currencyCode status expiresAt refundedAmount } } }`,
    notifications: `query { notifications(options:{take:100}) { items { id status audience publishedAt translations { languageCode title category } } } }`,
    content: `query { contentPages(options:{take:100}) { items { id kind key status sortOrder updatedAt publishedAt } } }`,
    crm: `query { crmProfiles(options:{take:100}) { items { id name email phone stage lastSeenAt assignedAdministratorId } } }`,
};

function itemList(area: Area, payload: any) {
    const root = area === 'inquiries' ? payload.inquiries
        : area === 'private-purchases' ? payload.privatePurchases
        : area === 'payment-requests' ? payload.paymentRequests
        : area === 'notifications' ? payload.notifications
        : area === 'content' ? payload.contentPages
        : payload.crmProfiles;
    return root?.items ?? [];
}

function mutationFor(area: Area, id: string) {
    if (area === 'inquiries') return [`mutation { archiveInquiry(id:"${id}") { id } }`, '封存'];
    if (area === 'notifications') return [`mutation { publishNotification(id:"${id}") { id } }`, '發布'];
    if (area === 'content') return [`mutation { publishContent(id:"${id}") { id } }`, '發布'];
    return null;
}

function AreaPage({ area }: { area: Area }) {
    const queryClient = useQueryClient();
    const list = useQuery({ queryKey: ['gallery-business', area], queryFn: () => api.query(documents[area]) as Promise<any> });
    const action = useMutation({
        mutationFn: (document: string) => api.mutate(document, {}),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gallery-business', area] }),
    });
    if (list.isLoading) return <div className="p-6">載入中…</div>;
    if (list.error) return <div className="p-6 text-destructive">無法載入：{(list.error as Error).message}</div>;
    const items = itemList(area, list.data);
    return <main className="mx-auto max-w-7xl space-y-5 p-6">
        <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold">{labels[area]}</h1>
            <Button variant="secondary" onClick={() => list.refetch()}>重新整理</Button>
        </div>
        {area === 'payment-requests' && <p className="text-sm text-muted-foreground">付款邀請會顯示訂金或尾款、狀態與期限。Stripe 付款結果以 webhook 為準。</p>}
        {area === 'private-purchases' && <p className="text-sm text-muted-foreground">請從案件詳情建立報價、訂金、尾款，並在全額收款與交付後結案。</p>}
        {!items.length ? <div className="rounded-lg border p-8 text-muted-foreground">目前沒有資料。</div> :
            <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left"><tr>{Object.keys(items[0]).filter(key => key !== '__typename').map(key => <th className="whitespace-nowrap px-4 py-3 font-medium" key={key}>{key}</th>)}<th className="px-4 py-3" /></tr></thead>
                    <tbody>{items.map((item: any) => {
                        const next = mutationFor(area, item.id);
                        return <tr className="border-t" key={item.id}>{Object.entries(item).filter(([key]) => key !== '__typename').map(([key, value]) => <td className="max-w-64 truncate px-4 py-3" key={key}>{Array.isArray(value) ? value.map((entry: any) => entry.title ?? entry.languageCode).join(', ') : String(value ?? '—')}</td>)}<td className="px-4 py-3">{next && <Button size="sm" variant="secondary" disabled={action.isPending} onClick={() => action.mutate(next[0])}>{next[1]}</Button>}</td></tr>;
                    })}</tbody>
                </table>
            </div>}
    </main>;
}

const makeRoute = (area: Area, permission: string): DashboardRouteDefinition => ({
    path: `/gallery/${area}`,
    navMenuItem: { sectionId: 'sales', id: `gallery-${area}`, url: `/gallery/${area}`, title: labels[area], requiresPermission: [permission] },
    loader: () => ({ breadcrumb: labels[area] }),
    component: () => <AreaPage area={area} />,
});

defineDashboardExtension({
    routes: [
        makeRoute('inquiries', 'ReadGallerySales'),
        makeRoute('private-purchases', 'ReadGallerySales'),
        makeRoute('payment-requests', 'ManageGalleryPayments'),
        makeRoute('notifications', 'ManageGalleryContent'),
        makeRoute('content', 'ManageGalleryContent'),
        makeRoute('crm', 'ManageGalleryCrm'),
    ],
});
