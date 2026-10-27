MASTER PROJECT PROMPT
Restaurant & Café QR Ordering and Management System
1. YOUR ROLE AND RESPONSIBILITIES
Act as a Senior Software Architect, Full-Stack Engineer, Database Architect, UI/UX Designer, Security Engineer, and QA Engineer.
Your mission is to design, implement, test, and deliver a production-oriented web application for managing restaurant and café operations through table-specific QR codes.
This must be a functional application, not a UI prototype or a collection of disconnected pages.
All user interfaces, database records, permissions, business rules, and real-time events must work together as one integrated system.
You are responsible for:

* Understanding the existing project before changing anything.
* Designing a maintainable application architecture.
* Implementing the complete business workflow.
* Creating and applying database migrations.
* Implementing secure authentication and authorization.
* Building responsive Arabic and English interfaces.
* Implementing real-time order updates.
* Testing critical business scenarios.
* Documenting setup, configuration, deployment, and administration.

Do not claim that a feature is implemented unless its actual functionality exists and has been verified.
Do not replace real functionality with hardcoded sample data, fake buttons, mock API responses, or simulated database operations.
2. PROJECT VISION
Build a web-based Restaurant & Café Management System that allows customers to scan a QR code displayed on a restaurant table, browse the menu, add products to a shopping cart, submit orders without creating an account, and track order progress.
The application must provide four primary operational experiences:

1. Customer Ordering Interface.
2. Cashier Dashboard.
3. Kitchen Display System (KDS).
4. Admin Management Panel.

The system must support a restaurant or café initially, while using an architecture that can accommodate multiple branches and multiple restaurant businesses in the future.
Do not implement a multi-tenant SaaS platform prematurely unless the existing project already requires it. However, avoid architectural decisions that would make future expansion unnecessarily difficult.
The initial release must not require an online payment gateway.
The cashier can record the payment method and payment status manually and close an order according to the configured business rules.
3. PROJECT EXECUTION RULES
Before implementing anything, follow these rules.
3.1 Inspect the existing project
If working inside an existing repository:

1. Inspect the project structure.
2. Identify the framework, language, dependencies, database, ORM, authentication implementation, and deployment configuration.
3. Read the existing project documentation and relevant architectural decision records.
4. Inspect the current application routes, components, API endpoints, database schema, and tests.
5. Identify existing features that can be reused.
6. Identify missing functionality, bugs, architectural risks, and security issues.
7. Prepare a concise implementation plan.

Do not replace the existing technology stack simply because you prefer another stack.
Do not delete working functionality or overwrite existing project configuration without a documented reason.
Preserve existing conventions and architectural decisions unless they conflict with essential security or business requirements.
If the project is new, select an appropriate technology stack and document the decision.
3.2 Implementation workflow
Use the following workflow:
DISCOVER → ANALYZE → DESIGN → IMPLEMENT → TEST → REVIEW → DOCUMENT.
For substantial decisions, explain the proposed solution and its trade-offs before implementation.
If working with a project that uses separate implementation threads, use the established project coordination process and obtain approval for significant architectural changes before proceeding.
For ordinary implementation details, use reasonable defaults and continue without asking unnecessary questions.
Do not stop after producing a plan. Begin implementing the application once the initial assessment is complete.
3.3 Definition of done
A feature is complete only when:

* Its user interface exists.
* Its business logic is implemented.
* Its database integration works where required.
* Permissions are enforced on the server.
* Validation and error handling are implemented.
* Relevant tests pass.
* Its behavior is documented where necessary.

Maintain a checklist of completed, partially completed, blocked, and untested features.
4. SYSTEM USERS AND ROLES
Implement role-based access control (RBAC).
The initial system must support these roles.
4.1 Super Admin / Administrator
The administrator can:

* Access the administrative dashboard.
* Create, edit, deactivate, and manage tables.
* Generate, download, print, and reissue table QR codes.
* Manage menu categories and products.
* Manage product availability and prices.
* Manage product options and add-ons.
* Manage delivery captains and waiters.
* Manage suppliers.
* Create and deactivate user accounts.
* Assign roles and permissions.
* View orders and operational dashboards.
* Review order history and reports.
* Configure restaurant information, languages, currency, tax settings, and operational preferences.
* View audit logs.
* Manage cancellations and exceptional operational situations.

Only authorized administrators can grant administrative privileges.
Never expose administrative credentials, secrets, or sensitive user information to public endpoints.
4.2 Cashier
The cashier can:

* Log in securely.
* View all operational tables.
* Receive new orders in real time.
* Open an order to see its complete details.
* View quantities, prices, modifiers, notes, and totals.
* Assign a captain to an order.
* Change the captain assignment when authorized.
* View kitchen progress.
* Record manual payment information.
* Close an order after the configured closure requirements are satisfied.
* Review authorized historical orders.
* Respond to waiter assistance requests.
* View relevant operational reports.

The cashier must not have unrestricted access to user management, security configuration, or other administrative functions.
4.3 Kitchen Staff
Kitchen users can:

* Log in securely.
* View new kitchen orders in real time.
* See order numbers, table numbers, quantities, product options, and preparation notes.
* Accept a new order.
* Mark an order as In Preparation.
* Mark an order as Ready.
* View preparation durations.
* View previously completed kitchen tickets when authorized.

Kitchen users must not be able to change product prices, manage accounts, assign administrative permissions, or close financial transactions.
4.4 Captain / Waiter
Prepare the architecture for a dedicated Captain / Waiter role.
The initial implementation may allow the cashier to assign captains without requiring a separate waiter login.
However, the system should be designed so that a future waiter interface can allow a captain to:

* View assigned orders.
* See the table number and order details.
* Accept an assignment.
* Confirm that an order has been delivered.
* View and respond to assistance requests.

Do not give waiters permissions to modify financial records or administrative settings unless explicitly authorized.
4.5 Enforce permissions on the server
Hiding a button in the frontend is not sufficient.
Every protected API endpoint and server-side action must verify the authenticated user's role and permissions.
Unauthenticated visitors must never gain access to cashier, kitchen, or admin functions.
5. TABLE MANAGEMENT AND QR CODE GENERATION
This is a core feature.
5.1 Creating a table
The administrator must be able to create a new table by entering:

* Table number.
* Optional table name.
* Optional section or location.
* Active/inactive status.

Table numbers must be unique within the applicable restaurant or branch.
After successful creation, the system must automatically:

1. Create the table record in the database.
2. Generate a unique public QR ordering URL.
3. Generate a QR code pointing to that URL.
4. Display the QR code in the admin interface.
5. Make the new table visible in the cashier and kitchen operational interfaces where appropriate.
6. Allow the administrator to download or print the QR code.

No manual frontend changes should be required when a table is added.
5.2 QR code design
Use a stable, unique, non-sequential public identifier or secure random token for the public ordering URL.
Example URL structure:
/order/table/{publicToken}
Do not rely solely on a predictable table number as the security mechanism.
The QR code should identify the table, not grant administrative privileges or unrestricted access to historical orders.
The administrator should be able to:

* Download a high-resolution QR image.
* Print a table card.
* Display the restaurant name and table number alongside the QR code.
* Regenerate or revoke a QR token when necessary.

When regenerating a token, invalidate the old token according to the configured security policy.
Changing the visible table number must not corrupt historical orders.
5.3 Table availability
Only active tables can accept new orders.
Inactive tables must display an appropriate unavailable message to customers.
Prevent duplicate table numbers and handle concurrent requests safely.
6. CUSTOMER ORDERING INTERFACE
The customer interface is public and does not require account creation or login.
It must be optimized for mobile phones because most customers will scan the QR code using a smartphone camera.
6.1 Customer landing page
When a customer scans a table QR code, open a dedicated ordering page.
Display:

* Restaurant or café name and logo.
* Table number.
* Language selector.
* Menu categories.
* Product images.
* Product names and descriptions.
* Product prices.
* Product availability.
* Shopping cart access.
* Assistance request button.

The customer must never be able to change the table identity simply by editing a visible table number.
The server must derive the table identity from the validated QR token.
6.2 Arabic and English support
Implement complete Arabic and English localization.
Arabic must use proper right-to-left (RTL) layout.
English must use left-to-right (LTR) layout.
Localization must cover:

* Navigation.
* Menu categories.
* Product names and descriptions.
* Buttons.
* Cart.
* Order confirmation.
* Order status.
* Validation messages.
* Error messages.
* Accessibility labels.
* Administrative interfaces where applicable.

Store translations as separate language fields or use the existing localization architecture.
Changing the interface language must not change the currency.
Currency is a separate restaurant configuration.
Persist the selected language during the customer session.
If a product lacks a translation, display a defined fallback language rather than an empty field.
6.3 Menu categories and products
The customer must be able to browse categories such as:

* Hot Coffee.
* Iced Coffee.
* Tea.
* Cold Drinks.
* Desserts.
* Meals.
* Snacks.

These are examples only. Administrators must be able to create and manage categories dynamically.
Each product should support:

* Product name in Arabic.
* Product name in English.
* Description in Arabic and English.
* Image.
* Price.
* Category.
* Availability status.
* Optional SKU or internal reference.
* Display order.
* Optional preparation station.
* Optional preparation time.
* Optional modifier groups.

Never hardcode the menu categories or products into the frontend.
The interface must reflect changes made through the admin panel.
6.4 Product options and add-ons
Prepare a flexible product modifier system.
Examples:

* Small / Medium / Large.
* Extra espresso shot.
* Extra milk.
* Sugar level.
* Ice level.
* Optional toppings.

Each modifier must support configurable prices where applicable.
The administrator must be able to define:

* Optional and required modifier groups.
* Minimum selections.
* Maximum selections.
* Individual option prices.
* Availability.

Validate modifier selections on the server before accepting an order.
Store the selected options and their prices as part of the order line so historical orders remain accurate even if the product is modified later.
6.5 Shopping cart
The customer must be able to:

* Add multiple products.
* Add the same product multiple times.
* Increase or decrease quantities.
* Remove products.
* Select product options.
* Add item-specific notes.
* Add an optional order-level note.
* View the subtotal and applicable charges.
* Review the complete order before submitting it.

The cart must work without requiring an account.
Persist the cart across normal page refreshes using a suitable client-side or session-based mechanism.
The cart must be associated with the validated table context.
If the customer scans another table's QR code, do not silently submit the previous cart to the new table.
Provide a clear warning and an explicit choice to clear or preserve the existing cart appropriately.
Do not trust prices or totals supplied by the browser.
The server must recalculate the complete order using current authoritative prices and validated options.
If prices or availability have changed, inform the customer and request confirmation when necessary.
6.6 Customer assistance request
Include a prominent button labeled:
Arabic: طلب مساعدة
English: Request Assistance
When clicked:

1. Create an assistance request associated with the table and its active session.
2. Record the creation time.
3. Prevent accidental duplicate requests through debouncing and an appropriate cooldown or deduplication rule.
4. Notify the cashier or authorized waiter interface in real time.
5. Display a confirmation message to the customer.
6. Allow authorized staff to acknowledge and resolve the request.

Suggested states:

* Pending.
* Acknowledged.
* Resolved.
* Cancelled, when appropriate.

An assistance request must not automatically change the kitchen order status.
Customers must not be able to access another table's private assistance history.
Provide appropriate rate limiting to prevent abuse.
6.7 Submitting an order
When the customer presses the Place Order button:

1. Validate the QR token and table status.
2. Validate the current table session.
3. Validate all products, quantities, and modifier selections.
4. Verify that each product is available.
5. Recalculate all prices and totals on the server.
6. Create the order and order items transactionally.
7. Generate a unique order reference.
8. Record the order creation time.
9. Publish the order-created event after the database transaction commits.
10. Return the order confirmation to the customer.

Prevent duplicate orders caused by double-clicking, retrying requests, or network interruptions.
Implement idempotency for order submission.
Never display a successful order confirmation until the order has actually been persisted.
If order creation fails, show a clear error and allow a safe retry.
7. ORDER NUMBERING AND RECEIPTS
Use a human-readable order number with the following suggested format:
YYYYMMDD-T{TABLE_NUMBER}-{SEQUENCE}
Example:
20261027-T012-0042
Where:

* YYYYMMDD is the restaurant's local business date.
* T012 identifies table 12.
* 0042 is a sequential number assigned according to the configured numbering scope.

Use a separate immutable internal order ID.
The visible reference must not be the database's only identifier.
The system must prevent duplicate order numbers under concurrent order creation.
Document whether the sequence is:

* Global for the restaurant.
* Per branch.
* Per table and business date.

Use a database-backed atomic numbering mechanism appropriate to the selected policy.
If the numbering sequence resets daily, use the configured restaurant timezone rather than the browser timezone.
Historical order references must never change when table numbers or menu data are updated.
7.1 Customer receipt
After successful submission, show a compact order confirmation containing:

* Restaurant name.
* Order reference.
* Table number.
* Order date and time.
* Ordered products.
* Quantities.
* Selected modifiers.
* Applicable prices.
* Subtotal.
* Tax and other configured charges.
* Total.
* Current order status.

This is an order confirmation, not a claim that payment has occurred.
Payment status must be displayed separately.
Provide a secure customer order-tracking mechanism.
Do not allow unrestricted access to order information merely because a visitor knows the table number or a sequential order reference.
Use a random, unguessable tracking token or another secure guest-session mechanism.
Do not expose administrative endpoints or sensitive order records through the tracking interface.
8. TABLE SESSIONS AND MULTIPLE ORDERS
Do not treat the table itself as the order.
A table can have a session, and a session can contain multiple orders.
Implement separate entities for:

* Table.
* Table Session.
* Order.
* Order Item.
* Payment Record.
* Assistance Request.
* Captain Assignment.

When an available table receives its first order, create or activate a table session.
Subsequent orders may belong to the same session according to the restaurant's configured operating policy.
The system must preserve every order within the session.
Do not overwrite an old order when a new one is submitted.
An order can have its own kitchen status, payment status, delivery status, and assigned captain.
The table session can have its own overall status.
If the restaurant chooses to allow only one active order per table, enforce that rule explicitly rather than assuming it.
The default implementation should support multiple orders within a single active table session.
9. CASHIER DASHBOARD
Build a real-time operational dashboard for authorized cashier users.
9.1 Table grid
Display all active tables as dynamically generated cards.
Each card should show:

* Table number.
* Table session status.
* Number of active orders.
* Current order references.
* Relevant preparation status.
* Assigned captain where applicable.
* Elapsed waiting time.
* Pending assistance indicator.

Do not hardcode the number of tables.
The grid must adapt to the number of tables and the screen size.
Provide search or filtering by table number and operational status.
9.2 Visual status indicators
Use the following suggested color scheme.
Available:

* Yellow.

New order:

* Alternating yellow and orange, accompanied by a sound or visual notification where enabled.

In preparation:

* Solid orange.

Ready:

* Solid green.

Closed or available again:

* Yellow.

The new-order animation must be noticeable but not distracting.
Provide a setting to disable sound.
Use text labels and accessible status indicators in addition to colors.
Respect reduced-motion accessibility settings.
The animation should stop when the appropriate staff member acknowledges the new order.
Do not remove an order merely because a user opened its details.
9.3 Order details
When a cashier selects a table or order, show:

* Order number.
* Table number.
* Order creation time.
* Products and quantities.
* Modifiers.
* Customer notes.
* Kitchen status.
* Captain assignment.
* Delivery status.
* Payment status.
* Subtotal, taxes, discounts, and total where applicable.
* Relevant event history.

Allow the cashier to assign or change the captain according to the permissions policy.
Record every assignment with its timestamp and the identity of the user who performed it.
Keep assignment history rather than overwriting the only record of the original captain.
9.4 Table release and reset
The cashier must have a clearly labeled Close Order or Close Table Session action, depending on the configured operating mode.
Before closing a session:

* Confirm that active orders have been handled.
* Confirm the configured payment requirements.
* Check for ready orders that have not been delivered.
* Check for unresolved operational issues according to restaurant policy.
* Display an appropriate confirmation dialog.

Do not silently discard active orders or assistance requests.
When a session is successfully closed:

1. Record the closure timestamp.
2. Record the closing user.
3. Preserve all order and payment history.
4. Close the table session.
5. Clear the current operational indicators.
6. Make the table available for a new session.
7. Generate new order references for future orders.

Reset means resetting the operational state, not deleting historical data.
Use explicit server-side state transitions to prevent two cashiers from closing or resetting the same session concurrently.
10. KITCHEN DISPLAY SYSTEM (KDS)
Implement a dedicated kitchen interface with large, readable order cards.
The cashier and kitchen can share a common design language, but their permissions and primary workflows must remain separate.
10.1 Kitchen order cards
Each kitchen ticket must show:

* Order reference.
* Table number.
* Order creation time.
* Time elapsed.
* Product names.
* Quantities.
* Modifiers.
* Preparation instructions.
* Current status.

Use clear typography and a layout suitable for a kitchen monitor or touchscreen.
Avoid small text and unnecessary navigation.
10.2 Kitchen workflow
Implement these transitions:
NEW → ACCEPTED → IN_PREPARATION → READY.
The initial implementation may combine ACCEPTED and IN_PREPARATION in the UI if necessary, but preserve a clear and auditable transition model.
The kitchen must not be able to mark an order as Ready before the relevant workflow requirements are satisfied.
When a kitchen user changes the status:

1. Validate the transition on the server.
2. Save the new status.
3. Record the user and timestamp.
4. Record the relevant event.
5. Notify the cashier and customer in real time.

The Ready state must remain visible until the order is handled according to the configured kitchen workflow.
Do not automatically mark an order as delivered merely because it is Ready.
Do not automatically close the table session when the kitchen finishes preparing an order.
10.3 Kitchen filters
Provide filters for:

* New.
* Accepted.
* In Preparation.
* Ready.
* Completed or archived tickets, where authorized.

Allow the kitchen to sort by oldest order or preparation priority.
Avoid silently hiding orders that still require attention.
Implement an overdue preparation indicator based on configurable thresholds.
11. ORDER, DELIVERY, AND PAYMENT STATE MACHINES
Implement separate state machines instead of using one status field for unrelated business concepts.
11.1 Kitchen order status
Suggested values:
NEW
ACCEPTED
IN_PREPARATION
READY
CANCELLED
Optional later states:
PARTIALLY_READY
REOPENED
Implement only states required by the actual business workflow.
11.2 Delivery status
Suggested values:
NOT_ASSIGNED
ASSIGNED
ACCEPTED
DELIVERED
Optional:
DELIVERY_FAILED
REASSIGNED
The kitchen status and delivery status must not overwrite each other.
For example, an order may be:
Kitchen status: READY
Delivery status: ASSIGNED
11.3 Payment status
Suggested values:
UNPAID
PARTIALLY_PAID
PAID
REFUNDED
PARTIALLY_REFUNDED
Implement only the required initial payment flows, while keeping the data model extensible.
A ready order is not necessarily paid.
A paid order is not necessarily delivered.
A delivered order is not necessarily sufficient to close the entire table session if additional orders remain open.
11.4 Table session status
Suggested values:
AVAILABLE
OPEN
CLOSING
CLOSED
Derive operational table colors from a well-defined combination of session state and active order states.
Do not allow the frontend to invent a state independently of the database.
Document the exact transition rules and which roles are permitted to execute each transition.
Use optimistic concurrency control, transactions, or another appropriate mechanism to prevent conflicting updates.
12. CAPTAIN / WAITER MANAGEMENT
The administrator must be able to:

* Add captains.
* Edit their information.
* Activate or deactivate them.
* Assign them to orders.
* View their current assignments.
* View assignment history.

Store captain assignments in a separate entity linked to the order.
Do not store only a captain name in a free-text order field.
Use a stable database identifier for each captain.
When an order is reassigned, preserve the previous assignment history.
Record who made the assignment and when.
An inactive captain must not receive new assignments, although historical assignments must remain visible.
The system should support a future dedicated captain dashboard without redesigning the entire order schema.
13. SUPPLIER MANAGEMENT
Implement a basic supplier management module.
Each supplier may include:

* Supplier name.
* Contact person.
* Phone number.
* Email.
* Address.
* Tax registration number, if applicable.
* Notes.
* Active/inactive status.
* Creation and update timestamps.

Validate inputs and restrict access to authorized administrators.
For the initial release, supplier management does not automatically imply inventory management or purchasing.
Design the data model so purchasing and inventory modules can be added later.
Do not claim to provide stock tracking unless actual stock movements and inventory business logic have been implemented.
14. ADMIN DASHBOARD
Create a professional administrative interface with a sidebar or equivalent navigation structure.
Required modules:

1. Overview Dashboard.
2. Tables & QR Codes.
3. Menu Categories.
4. Products.
5. Product Modifiers.
6. Orders.
7. Captains / Waiters.
8. Suppliers.
9. Users & Roles.
10. Reports.
11. Restaurant Settings.
12. Audit Logs.

14.1 Overview dashboard
Display meaningful operational indicators such as:

* Today's order count.
* Active table sessions.
* Orders awaiting kitchen acceptance.
* Orders in preparation.
* Ready orders awaiting delivery.
* Pending assistance requests.
* Today's recorded sales.
* Average preparation time, when sufficient data is available.

Calculate metrics from real database records.
Clearly distinguish recorded sales from unpaid order totals.
Do not invent data or display hardcoded figures as real business metrics.
14.2 Table administration
Provide:

* Create table.
* Edit table.
* Activate/deactivate table.
* Generate QR code.
* Download QR code.
* Print QR card.
* Regenerate QR token.
* View active session.
* View historical orders.

Do not allow table deletion if historical records depend on it. Prefer deactivation or soft deletion where appropriate.
14.3 Menu administration
Provide complete CRUD operations for categories, products, and modifiers.
Support:

* Arabic and English text.
* Image upload with validation.
* Product availability.
* Category assignment.
* Price updates.
* Display order.
* Modifier configuration.

Store an immutable snapshot of product descriptions, selected options, and prices in each order item.
Changing a product later must not change historical receipts.
14.4 User administration
Provide:

* Create user.
* Edit user profile.
* Assign role.
* Activate/deactivate account.
* Reset password through a secure process.
* View last login where supported.

Do not expose passwords or password hashes.
Do not allow administrators to accidentally remove the final active administrator without a recovery procedure.
Implement account lockout or rate limiting for repeated failed login attempts.
15. REAL-TIME COMMUNICATION
Real-time updates are essential.
When an order is submitted, relevant screens must update without manual page refresh.
Required event flows:
Customer submits an order
→ Database persists the order
→ Kitchen receives the new ticket
→ Cashier dashboard receives the order
→ Relevant table card changes state
→ Customer sees the updated order status.
Kitchen starts preparing the order
→ Database status changes
→ Cashier receives the update
→ Customer sees In Preparation.
Kitchen marks the order Ready
→ Database status changes
→ Kitchen, cashier, and customer interfaces receive the update.
Cashier assigns a captain
→ Assignment is persisted
→ Relevant cashier or waiter interface updates.
Customer requests assistance
→ Request is persisted
→ Authorized staff receive the alert.
15.1 Technical requirements
Use WebSockets, SSE, or a suitable managed real-time service based on the existing stack.
If using Supabase Realtime or another managed service, configure permissions and access policies correctly.
Never assume that a hidden frontend component provides authorization.
Public customer connections must not subscribe to unrestricted order, user, payment, or administrative database changes.
Use scoped channels, authorized subscriptions, and secure server-side access.
Implement reconnection handling and refresh critical state after reconnecting.
If real-time communication is temporarily unavailable, the system must degrade gracefully through controlled refetching or polling.
A temporary disconnect must not cause duplicate orders or lost database changes.
The database is the source of truth; real-time events are notifications of persisted changes, not the only storage mechanism.
16. DATABASE ARCHITECTURE
Design a normalized relational schema.
Adapt the exact table names to the existing project's conventions.
The schema should include entities equivalent to:

* restaurants, if needed by the architecture.
* branches, when required.
* users.
* roles.
* permissions, if implementing granular permissions.
* user_roles, if a user can have multiple roles.
* tables.
* table_sessions.
* menu_categories.
* products.
* product_translations, if used.
* product_modifier_groups.
* product_modifier_options.
* product_modifier_assignments.
* orders.
* order_items.
* order_item_modifiers.
* order_status_history.
* table_session_events.
* captains.
* captain_assignments.
* delivery_events.
* payments.
* assistance_requests.
* suppliers.
* audit_logs.
* restaurant_settings.
* idempotency_keys, or an equivalent idempotency mechanism.

Avoid unnecessary duplication and overengineering.
Define appropriate:

* Primary keys.
* Foreign keys.
* Unique constraints.
* Indexes.
* Check constraints.
* Referential integrity rules.
* Timestamps.
* Status fields.
* Soft-deletion policies where justified.

Use database transactions for operations that must succeed or fail together.
Examples include creating an order and its items, allocating an order number, recording payment changes, and closing a table session.
Use an appropriate money representation, such as fixed-precision decimal values or integer minor currency units.
Never use binary floating-point arithmetic for authoritative financial calculations.
Store the currency code alongside relevant financial records.
Use a consistent strategy for timestamps and restaurant-local business dates.
Use UTC for stored event timestamps where appropriate, and apply the configured restaurant timezone for business-day calculations and display.
All database changes must be versioned through migrations.
Do not make undocumented manual production schema changes.
17. FINANCIAL RULES AND CASHIER OPERATIONS
The initial release must support manual payment recording.
Do not integrate a payment gateway unless separately requested.
Implement a clear distinction between:

* Order total.
* Amount paid.
* Outstanding amount.
* Payment method.
* Payment status.
* Order closure status.

Support configurable payment methods, such as:

* Cash.
* Card.
* Other approved methods.

Recording a card payment manually does not mean the application has processed the card transaction.
Do not collect or store full card numbers, CVVs, or other sensitive payment credentials.
17.1 Financial calculations
Calculate totals on the server.
Support configured:

* Product prices.
* Modifier prices.
* Discounts, if enabled.
* Tax rates.
* Other authorized charges.

Use a documented rounding strategy.
Display the applied tax and discount breakdown where relevant.
Do not hardcode a tax rate.
Allow authorized administrators to configure applicable tax rules.
For Saudi Arabia, make the configuration capable of supporting applicable VAT rules, but do not claim that the system is tax-compliant merely because it calculates a percentage.
Any future tax-invoice functionality must be reviewed against the applicable regulatory requirements before being represented as compliant.
17.2 Payments and closure
Record each payment as a separate payment record.
Preserve payment history.
Do not overwrite prior payment records when additional payments are recorded.
Support partial payments only if they are enabled and their reconciliation behavior is clearly defined.
The cashier must not be able to mark an order Paid without recording the appropriate payment event.
If an order is cancelled or refunded, record the event and its reason.
Do not silently delete financial history.
18. UI/UX AND DESIGN SYSTEM
The interface must look like a professional commercial restaurant management product.
Avoid generic, inconsistent, or cluttered dashboards.
18.1 Customer design
Prioritize:

* Mobile-first layout.
* Fast menu browsing.
* Large touch targets.
* Readable typography.
* Clear product pricing.
* Simple quantity controls.
* Persistent cart access.
* Clear checkout confirmation.
* Visible table number.
* Easy language switching.

Minimize the number of steps between opening the menu and submitting an order.
Do not require unnecessary registration.
18.2 Cashier design
Prioritize:

* Clear table grid.
* Large status indicators.
* Prominent new-order alerts.
* Quick access to order details.
* Easy captain assignment.
* Clear payment and closure actions.
* Minimal navigation overhead.

18.3 Kitchen design
Prioritize:

* Large text.
* High contrast.
* Readable order cards.
* Minimal clicks.
* Clear preparation status.
* Preparation elapsed time.
* Touch-friendly controls.
* No unnecessary administrative controls.

18.4 Admin design
Prioritize:

* Consistent navigation.
* Searchable tables.
* Clear forms.
* Useful filters.
* Pagination where appropriate.
* Confirmation for destructive actions.
* Clear success and error messages.
* Loading, empty, and error states.

18.5 General requirements
Use a consistent design system for:

* Typography.
* Spacing.
* Colors.
* Buttons.
* Forms.
* Tables.
* Dialogs.
* Notifications.
* Status badges.

Support desktop, tablet, and mobile layouts.
Use accessible form labels and keyboard navigation.
Do not use color as the sole indicator of order status.
Avoid excessive animations and unnecessary visual effects.
19. SECURITY REQUIREMENTS
Treat security as a core requirement.
Implement appropriate protection against:

* Broken access control.
* Insecure direct object references.
* SQL injection.
* Cross-site scripting.
* Cross-site request forgery where relevant.
* Session theft.
* Brute-force login attempts.
* Unauthorized price manipulation.
* Unauthorized order modification.
* Duplicate order submissions.
* Unauthorized payment changes.
* Sensitive data exposure.
* Public access to internal dashboards.
* Insecure file uploads.
* Excessive API requests.

Additional requirements:

1. Use secure password hashing through a trusted authentication implementation.
2. Never store plaintext passwords.
3. Protect session cookies appropriately.
4. Use HTTPS in production.
5. Validate all server-side inputs.
6. Apply rate limits to authentication, public ordering, assistance requests, and sensitive endpoints.
7. Validate uploaded file types and sizes.
8. Enforce least-privilege access.
9. Keep secrets in environment variables or an appropriate secret manager.
10. Never expose privileged service keys to the browser.
11. Use database-level access policies when supported and appropriate.
12. Audit privileged operations.
13. Protect customer order-tracking tokens.
14. Restrict access to historical customer and financial records.
15. Avoid logging passwords, secrets, or unnecessary personal data.

If using Supabase, review Row Level Security (RLS) policies for every exposed table.
Do not disable RLS simply to make the frontend work.
Public access should be limited to the minimum data needed to display an active menu and submit a valid order.
The server must validate all public order submissions.
20. ERROR HANDLING AND OPERATIONAL RELIABILITY
Implement clear behavior for:

* Network interruptions.
* Database errors.
* Expired QR tokens.
* Inactive tables.
* Unavailable products.
* Invalid modifier selections.
* Duplicate requests.
* Concurrent order updates.
* Unauthorized actions.
* Invalid login credentials.
* Failed image uploads.
* Real-time connection interruptions.

Use user-friendly messages without exposing stack traces or internal secrets.
Log operational errors appropriately.
Do not swallow exceptions silently.
Implement retry behavior only where it is safe.
Never retry a financial or order-creation operation in a way that can create duplicate records.
Use idempotency keys or an equivalent safe request-deduplication mechanism.
Provide a reliable way to refresh operational state after a temporary connection failure.
21. AUDIT LOGGING
Create an audit trail for important business operations.
At minimum, record:

* User creation and role changes.
* Table creation and QR token changes.
* Product price changes.
* Product availability changes.
* Order cancellation.
* Order modification where supported.
* Kitchen status transitions.
* Captain assignments and reassignments.
* Payment recording and adjustment.
* Refunds.
* Table session closure.
* Administrative setting changes.

An audit entry should include, as appropriate:

* Actor.
* Action.
* Entity type.
* Entity ID.
* Timestamp.
* Relevant before-and-after values.
* Reason, where required.

Do not allow ordinary users to edit or delete audit records.
Avoid recording passwords, authentication tokens, or other secrets.
22. REPORTING AND ANALYTICS
Implement useful operational reports based on real database data.
Initial reports:

1. Daily order summary.
2. Orders by date range.
3. Orders by table.
4. Orders by kitchen status.
5. Sales by date.
6. Sales by payment method.
7. Top-selling products.
8. Product category performance.
9. Average preparation time.
10. Average order completion time.
11. Captain assignment and delivery statistics, when sufficient data exists.
12. Cancelled orders and cancellation reasons.

Allow date filters.
Use the restaurant's configured timezone when defining business days.
Clearly distinguish:

* Gross order value.
* Discounts.
* Tax amounts.
* Recorded payments.
* Outstanding balances.
* Refunds.
* Net recorded sales, according to a documented definition.

Do not label unpaid orders as collected revenue.
Do not generate fabricated reports when data is missing.
Support CSV export where appropriate and authorized.
PDF or printable reports may be added if practical.
23. PERFORMANCE AND SCALABILITY
Design for a growing number of tables, products, users, and orders.
Requirements:

* Paginate large administrative lists.
* Add indexes to frequently queried columns.
* Avoid N+1 query patterns.
* Avoid loading every historical order into an operational dashboard.
* Scope real-time subscriptions appropriately.
* Use efficient image handling.
* Optimize customer menu loading.
* Avoid unnecessary frontend rerenders.
* Use database constraints for critical uniqueness requirements.
* Handle concurrent orders from different tables.
* Handle multiple staff members updating different orders simultaneously.

The first release does not need complex microservices.
Prefer a maintainable modular architecture with clear boundaries.
Do not introduce distributed infrastructure unless there is a demonstrated requirement.
24. TESTING STRATEGY
Implement automated tests using the project's existing testing framework or a suitable equivalent.
24.1 Unit tests
Test:

* Order number generation.
* Financial calculations.
* Tax calculations.
* Modifier validation.
* Role and permission checks.
* Order state transitions.
* Table session transitions.
* Payment state transitions.
* Idempotency behavior.

24.2 Integration tests
Test:

* Creating tables and QR tokens.
* Retrieving the public menu.
* Submitting orders.
* Persisting order items and modifiers.
* Assigning captains.
* Updating kitchen status.
* Recording payments.
* Closing table sessions.
* Creating assistance requests.
* Enforcing authorization.
* Handling concurrent requests.

24.3 End-to-end tests
Implement end-to-end scenarios that exercise the actual application.
Scenario A: New order

1. Admin creates table 12.
2. System generates a QR code.
3. Table 12 appears in the operational dashboard.
4. Customer opens the QR URL without logging in.
5. Customer selects Arabic.
6. Customer adds two products to the cart.
7. Customer submits the order.
8. The system saves the order and creates a unique reference.
9. Kitchen receives the order.
10. Cashier receives the order.
11. Customer sees the confirmation and tracking status.

Scenario B: Kitchen preparation

1. Kitchen opens the new order.
2. Kitchen accepts the order.
3. Kitchen marks it In Preparation.
4. Cashier sees the update.
5. Customer sees the update.
6. Kitchen marks it Ready.
7. The status changes to Ready everywhere.

Scenario C: Captain and delivery

1. Cashier assigns an active captain.
2. The assignment is persisted.
3. The assignment appears in the order details.
4. The system records the assignment timestamp.
5. The delivery is confirmed.
6. The order retains its captain and delivery history.

Scenario D: Assistance request

1. Customer presses Request Assistance.
2. The request is persisted.
3. Staff receive the alert.
4. An authorized staff member acknowledges it.
5. Staff resolve the request.
6. The customer sees the appropriate confirmation where supported.

Scenario E: Payment and closure

1. Cashier opens the order.
2. Cashier records the appropriate payment.
3. Payment status is updated.
4. Cashier confirms the order and session satisfy closure requirements.
5. The table session closes.
6. The table becomes available.
7. The old order remains accessible in history.
8. A new order receives a different reference.

Scenario F: Security

1. An unauthenticated visitor attempts to open the admin dashboard.
2. Access is denied.
3. A kitchen user attempts to change product prices.
4. Access is denied.
5. A cashier attempts to create an administrator.
6. Access is denied.
7. A customer attempts to access another customer's order using a guessed sequential reference.
8. Access is denied.
9. A public API request attempts to submit a manipulated product price.
10. The server ignores the untrusted price and calculates the authoritative total.

Scenario G: Duplicate submission

1. A customer submits an order.
2. The request is repeated because of a simulated network retry.
3. The system does not create a duplicate order for the same idempotency key.
4. The customer can retrieve the original successful result.

Scenario H: Concurrent operations

1. Two authorized users attempt conflicting updates.
2. The system applies its concurrency rules.
3. No duplicate active session, inconsistent payment, or invalid state transition is created.
4. The rejected operation returns a clear error.

24.4 Test completion
Run the actual tests.
Do not claim tests passed if they were not executed.
Fix critical failures before marking the feature complete.
Document tests that cannot run because of missing external services or environment configuration.
25. DEVELOPMENT ENVIRONMENT AND DEPLOYMENT
Provide a clear and reproducible development environment.
Depending on the selected stack, include:

* Dependency installation instructions.
* Environment variable examples.
* Database setup.
* Database migrations.
* Development server startup.
* Test execution.
* Production build.
* Deployment instructions.
* Database backup and recovery guidance.

If Docker is appropriate, provide a suitable Docker Compose configuration.
Do not put real secrets into committed configuration files.
Provide a safe `.env.example`.
Do not overwrite existing deployment files without understanding their purpose.
If the project already runs locally, preserve the working setup unless a change is necessary.
The README must explain how to start and test the actual application.
26. INITIAL ADMINISTRATOR BOOTSTRAP
Provide a secure first-administrator setup mechanism.
Do not create a publicly accessible default administrator account with a predictable password.
Do not hardcode production administrator credentials.
Use an appropriate setup command, protected bootstrap process, or secure invitation flow.
Ensure the bootstrap process cannot be abused to create additional unauthorized administrators after initial setup.
Document how the initial administrator is created.
27. PRODUCT AND OPERATIONAL SETTINGS
Implement configurable restaurant settings.
At minimum:

* Restaurant name.
* Logo.
* Default language.
* Supported languages.
* Currency.
* Timezone.
* Tax configuration.
* Order numbering policy.
* New-order sound preference.
* Preparation time thresholds.
* Table session closure policy.
* Supported payment methods.
* Menu availability behavior.

Use a consistent settings model.
Do not scatter business settings across hardcoded constants and unrelated components.
Provide sensible initial defaults and document them.
28. OUT OF SCOPE FOR THE INITIAL RELEASE
Do not automatically implement these features unless the existing project already includes them or they are necessary for the selected architecture:

* Online payment gateway integration.
* Full accounting system.
* Automated purchasing and supplier invoicing.
* Inventory and recipe-based stock deduction.
* Payroll.
* Loyalty points.
* Customer accounts.
* Customer mobile applications.
* Delivery fleet management.
* Complex multi-tenant billing.

Prepare the architecture for future expansion without allowing these optional features to delay the initial working product.
Do not create empty modules or fake screens merely to claim that these features exist.
29. IMPLEMENTATION PHASES
Implement the project in the following sequence.
Phase 1: Assessment and architecture

* Inspect the existing project.
* Document the current stack and functionality.
* Define the core entities and relationships.
* Define state machines and permissions.
* Identify implementation risks.
* Produce an actionable implementation plan.

Phase 2: Database and backend foundation

* Create migrations.
* Implement authentication and authorization.
* Implement table and QR management.
* Implement menu and product management.
* Implement orders, order items, and numbering.
* Implement table sessions.
* Implement core validation and audit logging.

Phase 3: Customer experience

* Build the public QR ordering interface.
* Implement Arabic and English.
* Implement the dynamic menu.
* Implement modifiers and shopping cart.
* Implement order submission.
* Implement order confirmation and secure tracking.
* Implement assistance requests.

Phase 4: Cashier and kitchen

* Build the operational table grid.
* Implement new-order alerts.
* Build kitchen tickets.
* Implement kitchen status transitions.
* Implement captain assignment.
* Implement delivery tracking.
* Implement manual payment recording.
* Implement table session closure.

Phase 5: Administration

* Complete the admin dashboard.
* Implement user and role management.
* Implement supplier management.
* Implement restaurant settings.
* Implement reports and audit log views.

Phase 6: Testing and stabilization

* Execute unit tests.
* Execute integration tests.
* Execute end-to-end tests.
* Test authorization.
* Test duplicate submissions.
* Test concurrency.
* Fix critical defects.
* Verify real-time behavior.

Phase 7: Delivery

* Update documentation.
* Verify environment configuration.
* Verify database migrations.
* Verify production build.
* Document setup and deployment.
* Deliver a completion report.

Do not attempt to implement every feature in one unstructured code-generation pass.
Complete each phase coherently and maintain working functionality throughout development.
30. FINAL ACCEPTANCE CRITERIA
The initial release is acceptable only when all critical criteria below are satisfied.
A. An administrator can log in and create a table.
B. The system generates a valid QR code for that table.
C. The table appears automatically in the operational dashboard.
D. A customer can scan the QR code and access the menu without logging in.
E. The customer can switch between Arabic and English.
F. The customer can add multiple products, adjust quantities, and select valid modifiers.
G. The customer can submit an order and receive a unique order reference.
H. The order is persisted in the database with its item and price snapshots.
I. The kitchen and cashier receive the order through real-time updates or the documented fallback mechanism.
J. The kitchen can progress the order through valid preparation states.
K. The customer can track the order securely.
L. The cashier can assign a captain.
M. The system preserves captain assignment and delivery history.
N. A customer can request assistance, and authorized staff can acknowledge and resolve it.
O. The cashier can record payment information.
P. The cashier can close a valid order and table session according to the configured policy.
Q. The table becomes available for a new customer without deleting historical records.
R. Administrative actions are protected by server-side authorization.
S. Critical order creation, payment, and closure operations are protected against duplicate and conflicting requests.
T. Automated tests cover the essential business and security workflows.
U. The application starts successfully from the documented setup instructions.
V. The production build succeeds.
W. No critical functionality relies on hardcoded demonstration data or nonfunctional buttons.
31. REQUIRED DELIVERY REPORT
At the end of implementation, provide a concise but complete report containing:

1. Project architecture and selected technologies.
2. Implemented features.
3. Database entities and migrations created.
4. Authentication and authorization approach.
5. QR code and order numbering design.
6. Real-time communication design.
7. Business rules and state transitions.
8. Tests executed and their actual results.
9. Build status.
10. Known limitations.
11. Remaining defects or blocked tasks.
12. Environment variables that must be configured.
13. Commands required to start the application.
14. Database migration and bootstrap instructions.
15. Deployment and backup recommendations.
16. A checklist mapping the acceptance criteria to their actual implementation status.

Distinguish clearly between:

* Implemented and tested.
* Implemented but not fully tested.
* Partially implemented.
* Not implemented.
* Blocked by missing configuration or external dependencies.

Do not report completion merely because code files have been created.
32. YOUR FIRST ACTION
Start by inspecting the existing repository and determining whether this is an existing application or a new project.
If an existing project is available:

* Read the project instructions.
* Inspect the relevant code and database schema.
* Identify the current architecture.
* Preserve existing functionality.
* Present a concise implementation plan.
* Begin implementation immediately after the assessment.

If no application exists:

* Propose a maintainable technology stack.
* Explain the core architecture and major design decisions.
* Define the initial database schema and state machines.
* Establish the development environment.
* Begin implementing Phase 1 and proceed through the implementation phases.

Do not stop at recommendations, diagrams, or a plan.
Your goal is to deliver a working, tested, maintainable Restaurant & Café QR Ordering and Management System.
Prioritize business correctness, data integrity, security, usability, and maintainability over unnecessary complexity or cosmetic features.

33. CRITICAL REQUIREMENT: PERMANENT TABLE QR CODES
Each restaurant table must have one permanent, reusable QR code.
The QR code must be generated when the administrator creates the table and must remain unchanged throughout normal restaurant operations.
Mandatory rules:

1. The QR code is permanently associated with its table, not with an individual order or table session.
2. Every customer scanning the same table QR code must open the ordering page for that same table.
3. Creating a new order must never generate, replace, or modify the table's QR code.
4. Closing an order, closing a table session, resetting the table, or starting a new customer visit must never change the QR code.
5. Every new order must receive a new unique order reference while retaining the same table association.
6. The QR code must remain valid for subsequent customers and sessions.
7. Store the table's permanent public identifier separately from order IDs and table session IDs.
8. Do not generate QR codes dynamically for individual orders.
9. Do not automatically rotate, regenerate, or revoke QR tokens during normal operations.
10. QR regeneration or revocation, if supported, must be an explicit administrator action and must never happen automatically.

Example:
Table: T012
Permanent QR URL: /order/table/{permanentTableToken}
First customer:
20261027-T012-0001
Second customer:
20261027-T012-0002
Third customer:
20261027-T012-0003
All three orders use the same permanent table QR code.
When a table session closes, preserve the QR code and make the table available for the next customer.
The QR code identifies the table only. Order tracking must use a separate secure order-tracking token.
Implement and test this behavior explicitly. Do not consider the requirement complete until the same printed QR code successfully supports multiple consecutive orders and table sessions.
