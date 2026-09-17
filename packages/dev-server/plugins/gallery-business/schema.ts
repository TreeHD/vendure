import gql from 'graphql-tag';
const common = gql`
    input GalleryBusinessListOptions { skip: Int = 0 take: Int = 20 status: String search: String kind: String }
    type GalleryInquiry implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! code: String! type: String! productId: ID contactName: String! emailAddress: String! phoneNumber: String! subject: String! message: String! status: String! }
    type GalleryInquiryList implements PaginatedList { items: [GalleryInquiry!]! totalItems: Int! }
    input GalleryInquiryInput { type: String productId: ID contactName: String! emailAddress: String! phoneNumber: String subject: String! message: String! languageCode: String sourcePath: String }
    type GalleryProposal implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! version: Int! summary: String! amount: Int! depositAmount: Int! currencyCode: String! depositDueAt: DateTime! balanceDueAt: DateTime! }
    type GalleryPaymentRequest implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! purchaseId: ID! stage: String! amount: Int! currencyCode: String! expiresAt: DateTime! status: String! refundedAmount: Int! }
    type GalleryPaymentRequestList implements PaginatedList { items: [GalleryPaymentRequest!]! totalItems: Int! }
    type GalleryPrivatePurchase implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! code: String! productId: ID! artworkTitle: String! contactName: String! emailAddress: String! phoneNumber: String! preferredContactMethod: String! message: String! status: String! deliveredAt: DateTime proposals: [GalleryProposal!]! paymentRequests: [GalleryPaymentRequest!]! totalAmount: Int! paidAmount: Int! refundedAmount: Int! remainingAmount: Int! }
    type GalleryPrivatePurchaseList implements PaginatedList { items: [GalleryPrivatePurchase!]! totalItems: Int! }
    input GalleryPrivatePurchaseInput { productId: ID! contactName: String! emailAddress: String! phoneNumber: String! preferredContactMethod: String message: String! languageCode: String }
    type GalleryNotification implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! publishedAt: DateTime actionPath: String! }
    type GalleryNotificationList implements PaginatedList { items: [GalleryNotification!]! totalItems: Int! }
    type GalleryPublicContent { id: ID! key: String! kind: String! sortOrder: Int! publishedAt: DateTime! content: JSON! }
    type GalleryPublicContentList { items: [GalleryPublicContent!]! totalItems: Int! }
`;
export const shopSchema = gql`
    ${common}
    extend type GalleryNotification { title: String! body: String! category: String! unread: Boolean! }
    type GalleryCheckout { url: String! expiresAt: DateTime! }
    input GalleryEventInput { visitorToken: String eventType: String! path: String! productId: ID artistId: ID metadata: JSON }
    extend type Query {
        myNotifications(options: GalleryBusinessListOptions): GalleryNotificationList!
        myUnreadNotificationCount: Int!
        myPrivatePurchases(options: GalleryBusinessListOptions): GalleryPrivatePurchaseList!
        myPrivatePurchase(id: ID!): GalleryPrivatePurchase!
        paymentRequest(token: String!): GalleryPaymentRequest!
        paymentRequestStatus(token: String!): GalleryPaymentRequest!
        siteSettings: GalleryPublicContent
        contentPage(key: String!): GalleryPublicContent
        pressEntries(options: GalleryBusinessListOptions): GalleryPublicContentList!
        pressEntry(slug: String!): GalleryPublicContent
        teamMembers(options: GalleryBusinessListOptions): GalleryPublicContentList!
    }
    extend type Mutation {
        createInquiry(input: GalleryInquiryInput!): GalleryInquiry!
        createContactMessage(input: GalleryInquiryInput!): GalleryInquiry!
        createPrivatePurchase(input: GalleryPrivatePurchaseInput!): GalleryPrivatePurchase!
        claimPrivatePurchase(token: String!): GalleryPrivatePurchase!
        cancelMyPrivatePurchase(id: ID!, reason: String): GalleryPrivatePurchase!
        markMyNotificationRead(id: ID!): Boolean!
        markAllMyNotificationsRead: Int!
        createGalleryVisitorToken: String!
        recordGalleryEvent(input: GalleryEventInput!): Boolean!
        startPaymentRequestCheckout(token: String!): GalleryCheckout!
    }
`;
export const adminSchema = gql`
    ${common}
    extend type GalleryInquiry { customerId: ID assignedAdministratorId: ID internalNote: String! languageCode: String! sourcePath: String! }
    type GalleryCaseTransition { id: ID! createdAt: DateTime! fromStatus: String! toStatus: String! actorUserId: ID reason: String! }
    extend type GalleryPrivatePurchase { customerId: ID assignedAdministratorId: ID internalNote: String! orderId: ID history: [GalleryCaseTransition!]! }
    extend type GalleryPaymentRequest { orderId: ID! paymentId: ID stripeSessionId: String stripePaymentIntentId: String reason: String! paymentUrl: String }
    type GalleryNotificationTranslation { languageCode: String! title: String! body: String! category: String! }
    extend type GalleryNotification { status: String! audience: String! recipientIds: [ID!]! translations: [GalleryNotificationTranslation!]! }
    input GalleryNotificationTranslationInput { languageCode: String! title: String! body: String! category: String! }
    input GalleryNotificationInput { id: ID audience: String! recipientIds: [ID!] translations: [GalleryNotificationTranslationInput!]! publishedAt: DateTime actionPath: String }
    type GalleryContent implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! kind: String! key: String! status: String! sortOrder: Int! draft: JSON! published: JSON publishedAt: DateTime }
    type GalleryContentList implements PaginatedList { items: [GalleryContent!]! totalItems: Int! }
    input GalleryContentInput { id: ID key: String! sortOrder: Int content: JSON! }
    input GalleryInquiryUpdateInput { id: ID! status: String assignedAdministratorId: ID internalNote: String contactName: String emailAddress: String phoneNumber: String }
    input GalleryPrivatePurchaseUpdateInput { id: ID! status: String reason: String assignedAdministratorId: ID internalNote: String }
    input GalleryProposalInput { purchaseId: ID! summary: String! amount: Int! depositAmount: Int! depositDueAt: DateTime! balanceDueAt: DateTime! }
    input GalleryPaymentRequestInput { purchaseId: ID! stage: String! }
    type GalleryAnalyticsEvent { id: ID! createdAt: DateTime! eventType: String! path: String! productId: ID artistId: ID metadata: JSON! }
    type GalleryCrmProfile implements Node { id: ID! createdAt: DateTime! updatedAt: DateTime! customerId: ID name: String! email: String! phone: String! stage: String! assignedAdministratorId: ID notes: String! lastContactAt: DateTime lastSeenAt: DateTime! leadScore: Int eventCount: Int! recentEvents: [GalleryAnalyticsEvent!]! }
    type GalleryCrmProfileList implements PaginatedList { items: [GalleryCrmProfile!]! totalItems: Int! }
    type GalleryTopArtwork { productId: ID count: Int! }
    type GalleryCrmOverview { totalProfiles: Int! activeLeads: Int! customers: Int! periodDays: Int! topArtworks: [GalleryTopArtwork!]! }
    input GalleryCrmProfileInput { id: ID! stage: String assignedAdministratorId: ID notes: String lastContactAt: DateTime }
    type GalleryDashboardStats { totalArtworks: Int! totalArtists: Int! totalCustomers: Int! totalOrders: Int! pendingInquiries: Int! pendingPrivatePurchases: Int! paymentRequests: Int! crm: GalleryCrmOverview! }
    extend type Query {
        inquiries(options: GalleryBusinessListOptions): GalleryInquiryList!
        inquiry(id: ID!): GalleryInquiry!
        privatePurchases(options: GalleryBusinessListOptions): GalleryPrivatePurchaseList!
        privatePurchase(id: ID!): GalleryPrivatePurchase!
        paymentRequests(options: GalleryBusinessListOptions): GalleryPaymentRequestList!
        paymentRequest(id: ID!): GalleryPaymentRequest!
        notifications(options: GalleryBusinessListOptions): GalleryNotificationList!
        notification(id: ID!): GalleryNotification!
        contentPages(options: GalleryBusinessListOptions): GalleryContentList!
        managedContent(id: ID!): GalleryContent!
        crmOverview: GalleryCrmOverview!
        crmProfiles(options: GalleryBusinessListOptions): GalleryCrmProfileList!
        crmProfile(id: ID!): GalleryCrmProfile!
        galleryDashboardStats: GalleryDashboardStats!
    }
    extend type Mutation {
        createInquiry(input: GalleryInquiryInput!): GalleryInquiry!
        updateInquiry(input: GalleryInquiryUpdateInput!): GalleryInquiry!
        archiveInquiry(id: ID!): GalleryInquiry!
        updatePrivatePurchase(input: GalleryPrivatePurchaseUpdateInput!): GalleryPrivatePurchase!
        createPrivatePurchaseProposal(input: GalleryProposalInput!): GalleryProposal!
        confirmPrivatePurchaseDelivery(id: ID!): GalleryPrivatePurchase!
        createPaymentRequest(input: GalleryPaymentRequestInput!): GalleryPaymentRequest!
        revokePaymentRequest(id: ID!, reason: String!): GalleryPaymentRequest!
        resendPaymentRequest(id: ID!): GalleryPaymentRequest!
        refundPaymentRequest(id: ID!, reason: String!): GalleryPaymentRequest!
        createNotification(input: GalleryNotificationInput!): GalleryNotification!
        updateNotification(input: GalleryNotificationInput!): GalleryNotification!
        publishNotification(id: ID!): GalleryNotification!
        archiveNotification(id: ID!): GalleryNotification!
        saveContentPage(input: GalleryContentInput!): GalleryContent!
        savePressEntry(input: GalleryContentInput!): GalleryContent!
        saveTeamMember(input: GalleryContentInput!): GalleryContent!
        saveSiteSettings(input: GalleryContentInput!): GalleryContent!
        publishContent(id: ID!): GalleryContent!
        archiveContent(id: ID!): GalleryContent!
        updateCrmProfile(input: GalleryCrmProfileInput!): GalleryCrmProfile!
        setMembershipStatus(customerId: ID!, status: String!, tier: String!): Customer!
    }
`;
