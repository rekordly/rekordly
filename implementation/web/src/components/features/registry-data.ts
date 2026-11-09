import type { FeatureDefinition, FeatureId } from "../../types/features.ts";

export const FEATURE_REGISTRY_MAP: Record<FeatureId, FeatureDefinition> = {
  "ai-capture": {
    id: "ai-capture",
    name: "AI Capture",
    shortName: "Capture",
    headline: "Type what happened in plain words",
    description:
      "Convert short natural-language sentences into structured income, expense, sale, or invoice drafts with human confirmation.",
    category: "capture",
    route: "/capture",
    iconName: "Sparkle",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Available in both Personal and Business. Drafts must be explicitly confirmed before posting.",
    },
    primaryAction: {
      label: "Type what happened",
      shortLabel: "Capture",
      iconName: "Sparkle",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "No business entries yet",
        description:
          "Type what happened in everyday words to generate a structured draft. Every AI draft requires your explicit review and confirmation before posting to the ledger.",
        actionLabel: "Type what happened",
        tip: "Example: \"Received 45,000 NGN cash from Tunde for bulk rice delivery today\"",
      },
      personal: {
        title: "No personal entries yet",
        description:
          "Describe personal spending or income naturally. Rekordly classifies categories and accounts without accounting jargon.",
        actionLabel: "Type what happened",
        tip: "Example: \"Spent 8,500 NGN on fuel with GTBank debit card\"",
      },
      all: {
        title: "Consolidated capture inbox",
        description:
          "Review suggested drafts across your Personal and Business spaces. Drafts are never mixed between spaces.",
        actionLabel: "Type what happened",
        tip: "Select a target workspace to confirm and post drafts.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "AI Capture credits",
      limitUnit: "credits / month",
      enforcementNote:
        "Every natural-language parse checks available plan credits before processing. Manual form fallback is always available.",
    },
    tags: ["ai", "natural-language", "drafts", "universal-add", "capture"],
    supportsOfflineDrafts: true,
    requiresConfirmation: true,
  },

  "income-expenses": {
    id: "income-expenses",
    name: "Income & Expenses",
    shortName: "Transactions",
    headline: "All inflows, outflows, and transfers",
    description:
      "Core money tracking for personal spending, business cash movements, tax-deductible expenses, and account transfers.",
    category: "core-finance",
    route: "/transactions",
    iconName: "ArrowsLeftRight",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Personal tracks everyday spending. Business tracks operational inflows, deductible overhead, and cash books.",
    },
    primaryAction: {
      label: "Record transaction",
      shortLabel: "Record",
      iconName: "PlusCircle",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "No business transactions yet",
        description:
          "Record operational income, vendor overhead, utilities, or transfers. Confirmed entries create balanced ledger records.",
        actionLabel: "Record transaction",
        tip: "Tag tax-deductible expenses to streamline quarterly and year-end reporting.",
      },
      personal: {
        title: "No personal transactions yet",
        description:
          "Keep track of salary, transfers, and daily spending. Personal records stay strictly separated from business books.",
        actionLabel: "Record transaction",
        tip: "Assign categories like Groceries, Transport, and Utilities to monitor budget limits.",
      },
      all: {
        title: "Consolidated activity feed",
        description:
          "View real-time transactions side by side across Personal and Business spaces without mixing underlying books.",
        actionLabel: "Record transaction",
        tip: "Filter by workspace to see dedicated accounts and categories.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Transactions",
      limitUnit: "entries / month",
      enforcementNote:
        "Free tier limits new monthly entries; existing transaction history is always readable and exportable.",
    },
    tags: ["income", "expenses", "transfers", "ledger", "tax-deductible"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  sales: {
    id: "sales",
    name: "Sales & Orders",
    shortName: "Sales",
    headline: "Track customer sales and revenue",
    description:
      "Record point-of-sale sales, orders, service delivery, VAT, discounts, and customer payments.",
    category: "commercial",
    route: "/sales",
    iconName: "Receipt",
    status: "foundation",
    availability: {
      personal: false,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Sales are a commercial capability exclusive to Business workspaces.",
    },
    primaryAction: {
      label: "Record new sale",
      shortLabel: "New sale",
      iconName: "PlusCircle",
      kind: "primary",
      requiresSpace: "business",
    },
    emptyState: {
      business: {
        title: "No sales recorded yet",
        description:
          "Record your first customer sale. Support full, partial, split tender, and customer wallet payments.",
        actionLabel: "Record new sale",
        tip: "Record walk-in customers or select existing clients from your contacts list.",
      },
      personal: {
        title: "Sales are a Business feature",
        description:
          "Sales, invoices, and customer accounts are commercial features available in Business workspaces. Switch to a Business workspace to start recording sales.",
        actionLabel: "Switch to Business",
        tip: "Personal workspace focuses on personal income, expense tracking, and savings budgets.",
      },
      all: {
        title: "Commercial sales across businesses",
        description:
          "Consolidated revenue overview across your registered Business spaces. Sales figures are strictly business books.",
        actionLabel: "Record new sale",
        tip: "Select a specific business workspace to record new sales transactions.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Monthly sales orders",
      limitUnit: "orders / month",
      enforcementNote:
        "Higher tiers unlock unlimited sales, outlet-level reporting, and storefront order syncing.",
    },
    tags: ["sales", "revenue", "pos", "orders", "customers"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  purchases: {
    id: "purchases",
    name: "Purchases & Vendor Bills",
    shortName: "Purchases",
    headline: "Procurement, goods receipts, and supplier bills",
    description:
      "Record supplier purchases, purchase orders, goods receipts, and payable vendor bills.",
    category: "commercial",
    route: "/purchases",
    iconName: "ShoppingCart",
    status: "foundation",
    availability: {
      personal: false,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Purchases track business procurement and supplier liabilities.",
    },
    primaryAction: {
      label: "Record purchase",
      shortLabel: "New purchase",
      iconName: "PlusCircle",
      kind: "primary",
      requiresSpace: "business",
    },
    emptyState: {
      business: {
        title: "No supplier purchases recorded yet",
        description:
          "Track stock purchases, vendor bills, and supplier payments. Record tax-deductible procurement with proof attachments.",
        actionLabel: "Record purchase",
        tip: "Link purchases to suppliers to maintain accurate accounts payable balances.",
      },
      personal: {
        title: "Purchases are for business procurement",
        description:
          "Vendor purchasing, goods receipts, and supplier bills belong to Business spaces. For personal outflows, use Personal Expenses.",
        actionLabel: "Switch to Business",
        tip: "Personal spending is tracked in everyday Expenses.",
      },
      all: {
        title: "Consolidated procurement overview",
        description:
          "Overview of supplier commitments and procurement outflows across your businesses.",
        actionLabel: "Record purchase",
        tip: "Select a specific business workspace to approve or settle supplier bills.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Purchase bills",
      limitUnit: "bills / month",
      enforcementNote:
        "Starter and Business plans support multi-outlet inventory allocation and supplier aging.",
    },
    tags: ["purchases", "suppliers", "bills", "inventory", "procurement"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  invoices: {
    id: "invoices",
    name: "Invoices & Estimates",
    shortName: "Invoices",
    headline: "Professional client billing and receivables",
    description:
      "Issue branded invoices, proforma estimates, track payment status, due dates, and export downloadable PDFs.",
    category: "commercial",
    route: "/invoices",
    iconName: "FileText",
    status: "foundation",
    availability: {
      personal: false,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Customer billing is designed for freelancers and businesses.",
    },
    primaryAction: {
      label: "Create invoice",
      shortLabel: "New invoice",
      iconName: "PlusCircle",
      kind: "primary",
      requiresSpace: "business",
    },
    emptyState: {
      business: {
        title: "No customer invoices yet",
        description:
          "Create and send your first professional invoice. Track paid, partially paid, and overdue balances automatically.",
        actionLabel: "Create invoice",
        tip: "Invoices automatically generate backend-rendered PDF files with your company details.",
      },
      personal: {
        title: "Invoicing requires a Business space",
        description:
          "Billing clients with line items, tax numbers, and payment terms is a Business feature. Switch to a Business workspace to create invoices.",
        actionLabel: "Switch to Business",
        tip: "Freelancer and Business accounts support customizable invoice templates.",
      },
      all: {
        title: "Receivables summary across businesses",
        description:
          "Monitor outstanding customer balances and invoice aging across all owned business workspaces.",
        actionLabel: "Create invoice",
        tip: "Choose an active business workspace to issue a new customer invoice.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Invoices per month",
      limitUnit: "invoices / month",
      enforcementNote:
        "Free plan includes standard invoicing; paid plans remove monthly volume limits and watermarks.",
    },
    tags: ["invoices", "billing", "estimates", "receivables", "pdf"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  payments: {
    id: "payments",
    name: "Payments & Settlements",
    shortName: "Payments",
    headline: "Track settlements, receipts, and cash flows",
    description:
      "Record full, partial, and multi-tender customer payments, supplier disbursements, and bank settlements.",
    category: "core-finance",
    route: "/payments",
    iconName: "CreditCard",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Settlements link directly to sales, invoices, and supplier bills in Business, and to accounts in Personal.",
    },
    primaryAction: {
      label: "Record payment",
      shortLabel: "New payment",
      iconName: "CheckCircle",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "No payment records yet",
        description:
          "Record invoice settlements, POS receipts, or supplier bill payments. Supports cash, bank transfer, POS, and wallet.",
        actionLabel: "Record payment",
        tip: "Payments update document balances and post balanced ledger entries automatically.",
      },
      personal: {
        title: "No personal payments recorded",
        description:
          "Manage account disbursements, debt payoffs, and recurring service settlements.",
        actionLabel: "Record payment",
        tip: "Connect disbursements to specific bank accounts or mobile money wallets.",
      },
      all: {
        title: "Cross-space settlement activity",
        description:
          "Consolidated history of inflows, customer collections, and supplier disbursements across all accounts.",
        actionLabel: "Record payment",
        tip: "Filter by workspace to see specific payment proofs and ledger postings.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Payment records",
      limitUnit: "settlements / month",
      enforcementNote:
        "All paid plans support unlimited payment recording and multi-account reconciliation.",
    },
    tags: ["payments", "receipts", "settlements", "bank-transfer", "pos"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  loans: {
    id: "loans",
    name: "Loans & Debt Tracker",
    shortName: "Loans & Debt",
    headline: "Simple borrowed and lent tracking without accounting clutter",
    description:
      "Track principal borrowed (liabilities) and money lent to others (receivables). Repayments validate against balances.",
    category: "liabilities",
    route: "/loans",
    iconName: "HandCoins",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "personal",
      explanation:
        "Tracks simple principal without complex compound amortization schedules.",
    },
    primaryAction: {
      label: "Record loan or debt",
      shortLabel: "New loan",
      iconName: "HandCoins",
      kind: "primary",
    },
    emptyState: {
      personal: {
        title: "No personal loans or debts",
        description:
          "Track money you borrowed from friends or family, or money you lent to others. Linked repayments reduce outstanding principal.",
        actionLabel: "Record loan or debt",
        tip: "Rekordly avoids complex interest math; manual interest is simply tagged as normal income or expense.",
      },
      business: {
        title: "No business loans or credit facilities",
        description:
          "Record working capital loans, founder director loans, or formal vendor credits. Repayments validate balance boundaries.",
        actionLabel: "Record loan or debt",
        tip: "Loan repayments cannot reduce the principal balance below zero.",
      },
      all: {
        title: "Consolidated debt and receivables summary",
        description:
          "High-level balance of what you owe and what is owed to you across Personal and Business spaces.",
        actionLabel: "Record loan or debt",
        tip: "View liabilities and receivables grouped by counterparty and due date.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Active loan records",
      limitUnit: "loans tracked",
      enforcementNote:
        "Free tier supports essential debt tracking; upgrade for multiple lender accounts and reminder notifications.",
    },
    tags: ["loans", "debt", "liabilities", "receivables", "counterparties"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  "customer-deposits": {
    id: "customer-deposits",
    name: "Customer Deposits & Wallets",
    shortName: "Wallets",
    headline: "Advance deposits and store credit",
    description:
      "Hold customer advance payments securely as trust liabilities (not revenue) until applied to future sales or invoices.",
    category: "commercial",
    route: "/wallets",
    iconName: "Wallet",
    status: "foundation",
    availability: {
      personal: false,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Customer advance deposits are liability accounts held in Business workspaces.",
    },
    primaryAction: {
      label: "Record customer deposit",
      shortLabel: "Deposit",
      iconName: "PlusCircle",
      kind: "primary",
      requiresSpace: "business",
    },
    emptyState: {
      business: {
        title: "No customer advance deposits yet",
        description:
          "Record money received from customers before work or goods are delivered. Deposits are held as liabilities until settled.",
        actionLabel: "Record customer deposit",
        tip: "Customer wallet balances can never drop below zero; checkout prevents overdrawing.",
      },
      personal: {
        title: "Customer wallets are a Business feature",
        description:
          "Customer deposit ledgers and store credits are designed for businesses managing client retainers and prepayments.",
        actionLabel: "Switch to Business",
        tip: "To track your personal savings, use the Budgets and Accounts surfaces.",
      },
      all: {
        title: "Customer trust liabilities across businesses",
        description:
          "Total advance deposits held on behalf of customers across all owned business workspaces.",
        actionLabel: "Record customer deposit",
        tip: "Customer deposits represent trust funds and are not recognized as revenue until redeemed.",
      },
    },
    planGate: {
      tier: "starter",
      limitLabel: "Customer wallets",
      limitUnit: "customer accounts",
      enforcementNote:
        "Starter plan or higher required for automated customer wallet ledgers and advance deposit tracking.",
    },
    tags: ["wallets", "deposits", "advances", "liabilities", "store-credit"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  "split-payments": {
    id: "split-payments",
    name: "Split Payments & Multi-Tender",
    shortName: "Split Payments",
    headline: "Settle single transactions with multiple payment methods",
    description:
      "Combine cash, bank transfer, POS, and customer wallet on one invoice or sale with exact total balancing.",
    category: "commercial",
    route: "/split-payments",
    iconName: "SplitVertical",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Supported across both spaces. Enforces that sum of splits equals exact amount due.",
    },
    primaryAction: {
      label: "Configure split payment",
      shortLabel: "Split tender",
      iconName: "SplitVertical",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "No split payments active",
        description:
          "Allow customers to pay partially in cash and bank transfer, or redeem wallet credit alongside card payments.",
        actionLabel: "Configure split payment",
        tip: "Total split rows cannot exceed the amount due. Overpayments are rejected by the backend.",
      },
      personal: {
        title: "No split personal expenses recorded",
        description:
          "Split single purchases across multiple personal accounts or cards when settling major expenses.",
        actionLabel: "Configure split payment",
        tip: "Useful when paying part in cash and part via bank transfer.",
      },
      all: {
        title: "Multi-tender summary",
        description:
          "Overview of multi-method settlements across sales and recorded transactions.",
        actionLabel: "Configure split payment",
        tip: "Review tender composition across cash, POS, and electronic transfers.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Split payments",
      limitUnit: "allowed",
      enforcementNote:
        "Available on all tiers to reflect real-world Nigerian payment multi-tender realities.",
    },
    tags: ["split-payments", "multi-tender", "cash", "pos", "transfer"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  budgets: {
    id: "budgets",
    name: "Budgets & Spending Targets",
    shortName: "Budgets",
    headline: "Set category limits and track income goals",
    description:
      "Monitor spending limits by category across weekly, monthly, and yearly timeframes using server-side aggregate calculations.",
    category: "planning",
    route: "/budgets",
    iconName: "ChartPieSlice",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "personal",
      explanation:
        "Personal tracks household and discretionary spending. Business tracks departmental and operational cost envelopes.",
    },
    primaryAction: {
      label: "Create budget",
      shortLabel: "New budget",
      iconName: "PlusCircle",
      kind: "primary",
    },
    emptyState: {
      personal: {
        title: "No personal budgets set",
        description:
          "Set monthly spending limits for categories like Food, Transport, and Entertainment to stay on track.",
        actionLabel: "Create budget",
        tip: "Budget vs. actual progress updates automatically from your confirmed transactions.",
      },
      business: {
        title: "No business budgets configured",
        description:
          "Define expense limits for operational overhead, inventory restocking, and marketing budgets.",
        actionLabel: "Create budget",
        tip: "Track budget adherence using backend aggregate reports without slow client-side recalculations.",
      },
      all: {
        title: "Consolidated budget performance",
        description:
          "Compare personal budget discipline alongside business operational spending.",
        actionLabel: "Create budget",
        tip: "Ensure personal drawings and business investments remain within target allocations.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Active budgets",
      limitUnit: "budgets",
      enforcementNote:
        "Free tier includes essential monthly category budgets; Pro unlocks multi-period and department targets.",
    },
    tags: ["budgets", "planning", "spending-limits", "goals", "actuals"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  "reports-tax": {
    id: "reports-tax",
    name: "Tax Readiness & Financial Reports",
    shortName: "Reports & Tax",
    headline: "VAT summaries, taxable income, and accountant-ready exports",
    description:
      "Generate VAT collected vs. paid schedules, taxable income summaries, deductible expenses, and export PDF/CSV files.",
    category: "compliance",
    route: "/reports/tax",
    aliases: ["/reports"],
    iconName: "Scales",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Business generates tax readiness schedules (VAT, taxable profit, deductions). Personal generates category spending summaries.",
    },
    primaryAction: {
      label: "Generate report",
      shortLabel: "New report",
      iconName: "DownloadSimple",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "No tax or financial reports generated",
        description:
          "Compile VAT collected vs. VAT paid, taxable turnover, and allowable business expense deductions.",
        actionLabel: "Generate report",
        tip: "Rekordly reports prepare your books for your accountant; we never claim to auto-file with FIRS or replace professional tax advice.",
      },
      personal: {
        title: "No personal financial summaries",
        description:
          "Review annual and monthly income vs. expense breakdowns, category spending trends, and net cash movement.",
        actionLabel: "Generate report",
        tip: "Export your personal annual financial summary as a PDF or CSV document.",
      },
      all: {
        title: "Consolidated owner financial statements",
        description:
          "High-level cash movement and financial position across all registered workspaces.",
        actionLabel: "Generate report",
        tip: "Review business profit statements side-by-side with personal savings progress.",
      },
    },
    planGate: {
      tier: "starter",
      limitLabel: "Tax readiness reports",
      limitUnit: "quarterly / annual exports",
      enforcementNote:
        "Free tier provides annual overview; Starter and Business tiers unlock quarterly VAT and on-demand tax schedules.",
    },
    tags: ["reports", "tax", "vat", "deductions", "exports", "pdf", "csv"],
    supportsOfflineDrafts: false,
    requiresConfirmation: false,
  },

  "offline-sync": {
    id: "offline-sync",
    name: "Offline Drafts & Sync",
    shortName: "Offline & Sync",
    headline: "Work reliably without network connectivity",
    description:
      "Capture up to 100 queued drafts offline. When reconnected, changes sync to the server with server-wins conflict resolution.",
    category: "platform",
    route: "/sync",
    iconName: "CloudSlash",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Guarantees that poor network never stops you from recording a sale, expense, or customer receipt.",
    },
    primaryAction: {
      label: "Review sync status",
      shortLabel: "Sync status",
      iconName: "ArrowsClockwise",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "All business entries synced",
        description:
          "Your device is connected and all drafts have been safely saved to Rekordly servers. Up to 100 entries can be queued offline.",
        actionLabel: "Review sync status",
        tip: "Server is always the authoritative financial truth. Finalized records, balances, and invoices cannot be overridden offline.",
      },
      personal: {
        title: "Personal records synced",
        description:
          "No pending offline records. Any spending captured offline will automatically upload when network returns.",
        actionLabel: "Review sync status",
        tip: "Cached personal summaries indicate when data was last refreshed.",
      },
      all: {
        title: "Device synchronization queue",
        description:
          "All workspaces are synchronized with Rekordly cloud infrastructure. Zero pending offline mutations.",
        actionLabel: "Review sync status",
        tip: "Network queue holds up to 100 safe actions before requiring a sync check.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Offline draft queue depth",
      limitUnit: "100 pending actions",
      enforcementNote:
        "Offline queue depth is capped at 100 items across all plans to protect local state integrity.",
    },
    tags: ["offline", "sync", "queue", "drafts", "idempotency"],
    supportsOfflineDrafts: true,
    requiresConfirmation: false,
  },

  "plan-limits": {
    id: "plan-limits",
    name: "Plan Limits & Entitlements",
    shortName: "Plan & Billing",
    headline: "Transparent usage tracking and subscription quotas",
    description:
      "Monitor monthly transactions, AI capture credits, team seats, and exports without unexpected lockouts.",
    category: "platform",
    route: "/billing",
    iconName: "Gauge",
    status: "foundation",
    availability: {
      personal: true,
      business: true,
      allSummary: true,
      defaultScope: "business",
      explanation:
        "Personal space is free forever. Business spaces reflect the workspace subscription plan.",
    },
    primaryAction: {
      label: "View plan limits",
      shortLabel: "Plan details",
      iconName: "Gauge",
      kind: "primary",
    },
    emptyState: {
      business: {
        title: "Current plan usage and quotas",
        description:
          "Monitor transaction quotas, monthly AI credits, and feature availability. Free limits stop new creations, never existing data.",
        actionLabel: "View plan limits",
        tip: "You always retain full read and export access to your financial records even if a plan expires.",
      },
      personal: {
        title: "Personal space is free",
        description:
          "Rekordly Personal finance is completely free for individual record keeping, household budgets, and debt tracking.",
        actionLabel: "View plan limits",
        tip: "Upgrade options apply only when operating a commercial business workspace.",
      },
      all: {
        title: "Subscription overview across workspaces",
        description:
          "Consolidated account billing, active workspace subscriptions, and entitlement status.",
        actionLabel: "View plan limits",
        tip: "Each Business workspace has its own distinct plan tier and billing cycle.",
      },
    },
    planGate: {
      tier: "free",
      limitLabel: "Entitlement evaluation",
      limitUnit: "server-enforced",
      enforcementNote:
        "Plan gates are enforced server-side. Frontend reflects entitlements without inventing mock billing charges.",
    },
    tags: ["billing", "plans", "limits", "subscriptions", "entitlements"],
    supportsOfflineDrafts: false,
    requiresConfirmation: false,
  },
};

export const ALL_FEATURE_IDS: readonly FeatureId[] = [
  "ai-capture",
  "income-expenses",
  "sales",
  "purchases",
  "invoices",
  "payments",
  "loans",
  "customer-deposits",
  "split-payments",
  "budgets",
  "reports-tax",
  "offline-sync",
  "plan-limits",
] as const;

export const FEATURE_REGISTRY_LIST: readonly FeatureDefinition[] =
  ALL_FEATURE_IDS.map((id) => FEATURE_REGISTRY_MAP[id]);
