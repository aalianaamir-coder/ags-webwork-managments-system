import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notify,
  withCodeRetry,
  parseDateSafe,
  sanitize,
  parseFloatSafe,
} from "@/lib/helpers";

export const GET = handler(async (req: Request) => {
  await requirePermission("expenses:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const category = sanitize(url.searchParams.get("category"));
  const status = sanitize(url.searchParams.get("status"));
  const from = parseDateSafe(url.searchParams.get("from"));
  const to = parseDateSafe(url.searchParams.get("to"));

  const expenses = await db.expense.findMany({
    where: {
      AND: [
        category ? { category } : {},
        status ? { status } : {},
        from ? { spentAt: { gte: from } } : {},
        to ? { spentAt: { lte: to } } : {},
        q
          ? {
              OR: [
                { expenseCode: { contains: q } },
                { description: { contains: q } },
                { vendor: { contains: q } },
              ],
            }
          : {},
      ],
    },
    orderBy: { spentAt: "desc" },
    include: { creator: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const approved = expenses.filter((e) => e.status === "Approved");
  const totals = {
    approved: approved.reduce((s, e) => s + e.amount, 0),
    pending: expenses
      .filter((e) => e.status === "Pending")
      .reduce((s, e) => s + e.amount, 0),
    rejected: expenses
      .filter((e) => e.status === "Rejected")
      .reduce((s, e) => s + e.amount, 0),
  };
  return Response.json({ expenses, totals });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("expenses:write");
  const b = await req.json().catch(() => ({}));
  const description = sanitize(b.description);
  const amount = parseFloatSafe(b.amount);
  const category = sanitize(b.category);
  if (!description) throw new ApiError(400, "Description is required");
  if (!amount || amount <= 0)
    throw new ApiError(400, "Amount must be greater than zero");
  if (!category) throw new ApiError(400, "Category is required");

  const expense = await withCodeRetry("expense", "expenseCode", (expenseCode) =>
    db.expense.create({
      data: {
        expenseCode,
        category,
        description,
        amount,
        spentAt: parseDateSafe(b.spentAt) ?? new Date(),
        vendor: sanitize(b.vendor),
        method: sanitize(b.method) ?? "Bank Transfer",
        reference: sanitize(b.reference),
        notes: sanitize(b.notes),
        status: "Pending", // CEO approval required
        createdById: user.id,
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "expense",
    entityId: expense.id,
    summary: `Expense recorded: ${expense.expenseCode} — SAR ${amount.toFixed(2)} (${category}) — awaiting CEO approval`,
  });
  // Notify admins about the pending approval (hidden system accounts excluded)
  const admins = await db.user.findMany({
    where: { role: "ADMIN", isActive: true, hidden: false },
  });
  for (const a of admins) {
    if (a.id !== user.id) {
      await notify({
        userId: a.id,
        title: "Expense awaiting approval",
        body: `${expense.expenseCode}: SAR ${amount.toFixed(2)} — ${description} (by ${user.name}).`,
        type: "alert",
        link: "expenses",
      });
    }
  }
  return Response.json({ expense }, { status: 201 });
});
