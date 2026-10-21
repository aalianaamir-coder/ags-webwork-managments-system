import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notify,
  parseFloatSafe,
  parseDateSafe,
  sanitize,
} from "@/lib/helpers";
import type { Prisma } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, { params }: Params) => {
  await requirePermission("clients:read");
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      assignedTo: {
        select: { id: true, name: true, avatarUrl: true, jobTitle: true },
      },
      orders: {
        orderBy: { createdAt: "desc" },
        include: { developer: { select: { id: true, name: true } } },
      },
      invoices: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { receivedAt: "desc" } },
      subscriptions: { include: { plan: true } },
      tickets: { orderBy: { createdAt: "desc" } },
      files: {
        orderBy: { createdAt: "desc" },
        include: { uploader: { select: { name: true } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!client) throw new ApiError(404, "Client not found");
  return Response.json({ client });
});

export const PUT = handler(async (req: Request, { params }: Params) => {
  const user = await requirePermission("clients:write");
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const existing = await db.client.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Client not found");

  const data: Record<string, unknown> = {
    businessName: sanitize(b.businessName) ?? existing.businessName,
    businessCategory: sanitize(b.businessCategory),
    contactPerson: sanitize(b.contactPerson),
    phone: sanitize(b.phone),
    whatsapp: sanitize(b.whatsapp),
    email: sanitize(b.email),
    location: sanitize(b.location),
    city: sanitize(b.city),
    mapsUrl: sanitize(b.mapsUrl),
    websiteUrl: sanitize(b.websiteUrl),
    instagramUrl: sanitize(b.instagramUrl),
    twitterUrl: sanitize(b.twitterUrl),
    facebookUrl: sanitize(b.facebookUrl),
    linkedinUrl: sanitize(b.linkedinUrl),
    serviceRequested: sanitize(b.serviceRequested),
    quotedPrice: parseFloatSafe(b.quotedPrice),
    agreedPrice: parseFloatSafe(b.agreedPrice),
    leadSource: sanitize(b.leadSource),
    acquisitionDate: parseDateSafe(b.acquisitionDate),
    assignedToId: sanitize(b.assignedToId),
    status: sanitize(b.status) ?? existing.status,
    notes: sanitize(b.notes),
    archived: typeof b.archived === "boolean" ? b.archived : existing.archived,
  };

  // Duplicate check (excluding this client)
  const phone = data.phone as string | null;
  const whatsapp = data.whatsapp as string | null;
  const email = data.email as string | null;
  const websiteUrl = data.websiteUrl as string | null;
  const dupWhere: Prisma.ClientWhereInput[] = [];
  if (phone) dupWhere.push({ phone });
  if (whatsapp) dupWhere.push({ whatsapp });
  if (email) dupWhere.push({ email });
  if (websiteUrl) dupWhere.push({ websiteUrl });
  if (dupWhere.length) {
    const dup = await db.client.findFirst({
      where: { AND: [{ OR: dupWhere }, { archived: false }], id: { not: id } },
    });
    if (dup)
      throw new ApiError(
        409,
        `Possible duplicate: “${dup.businessName}” (${dup.clientCode}) already has a matching phone or email.`,
      );
  }

  const client = await db.client.update({ where: { id }, data });
  await logActivity({
    userId: user.id,
    action: "update",
    entity: "client",
    entityId: id,
    summary: `Client updated: ${client.businessName} (${client.clientCode})`,
    details: {
      changedStatus:
        existing.status !== client.status
          ? `${existing.status} → ${client.status}`
          : undefined,
    },
  });
  if (existing.assignedToId !== client.assignedToId && client.assignedToId) {
    await notify({
      userId: client.assignedToId,
      title: "Client assigned to you",
      body: `${client.businessName} (${client.clientCode}) is now assigned to you.`,
      link: "clients",
    });
  }
  return Response.json({ client });
});

export const DELETE = handler(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("clients:delete");
  const { id } = await params;
  const existing = await db.client.findUnique({
    where: { id },
    include: {
      _count: { select: { orders: true, invoices: true, payments: true } },
    },
  });
  if (!existing) throw new ApiError(404, "Client not found");
  if (
    existing._count.orders > 0 ||
    existing._count.invoices > 0 ||
    existing._count.payments > 0
  ) {
    // Guard business history: archive instead of hard delete
    await db.client.update({ where: { id }, data: { archived: true } });
    await logActivity({
      userId: user.id,
      action: "archive",
      entity: "client",
      entityId: id,
      summary: `Client archived (has linked records): ${existing.businessName} (${existing.clientCode})`,
    });
    return Response.json({
      ok: true,
      archived: true,
      message:
        "Client has linked orders/payments — archived instead of deleted.",
    });
  }
  await db.client.delete({ where: { id } });
  await logActivity({
    userId: user.id,
    action: "delete",
    entity: "client",
    entityId: id,
    summary: `Client deleted: ${existing.businessName} (${existing.clientCode})`,
  });
  return Response.json({ ok: true });
});
