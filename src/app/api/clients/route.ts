import { db } from "@/lib/db";
import { handler, ApiError, requirePermission } from "@/lib/permissions";
import {
  logActivity,
  notify,
  withCodeRetry,
  parseFloatSafe,
  parseDateSafe,
  sanitize,
} from "@/lib/helpers";
import type { Prisma } from "@prisma/client";

export const GET = handler(async (req: Request) => {
  await requirePermission("clients:read");
  const url = new URL(req.url);
  const q = sanitize(url.searchParams.get("q"));
  const status = sanitize(url.searchParams.get("status"));
  const assignedTo = sanitize(url.searchParams.get("assignedTo"));
  const includeArchived = url.searchParams.get("archived") === "true";

  const clients = await db.client.findMany({
    where: {
      AND: [
        includeArchived ? {} : { archived: false },
        status ? { status } : {},
        assignedTo ? { assignedToId: assignedTo } : {},
        q
          ? {
              OR: [
                { businessName: { contains: q } },
                { contactPerson: { contains: q } },
                { phone: { contains: q } },
                { whatsapp: { contains: q } },
                { email: { contains: q } },
                { clientCode: { contains: q } },
                { location: { contains: q } },
                { city: { contains: q } },
              ],
            }
          : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      assignedTo: { select: { id: true, name: true, avatarUrl: true } },
      _count: {
        select: {
          orders: true,
          invoices: true,
          payments: true,
          subscriptions: true,
        },
      },
    },
  });
  return Response.json({ clients });
});

export const POST = handler(async (req: Request) => {
  const user = await requirePermission("clients:write");
  const b = await req.json().catch(() => ({}));

  const businessName = sanitize(b.businessName);
  if (!businessName) throw new ApiError(400, "Business name is required");

  // Duplicate prevention: same phone / whatsapp / email / website
  const phone = sanitize(b.phone);
  const whatsapp = sanitize(b.whatsapp);
  const email = sanitize(b.email)?.toLowerCase() ?? null;
  const websiteUrl = sanitize(b.websiteUrl);
  const dupWhere: Prisma.ClientWhereInput[] = [];
  if (phone) dupWhere.push({ phone });
  if (whatsapp) dupWhere.push({ whatsapp: whatsapp });
  if (email) dupWhere.push({ email });
  if (websiteUrl) dupWhere.push({ websiteUrl });
  if (dupWhere.length) {
    const dup = await db.client.findFirst({
      where: { OR: dupWhere, archived: false },
    });
    if (dup) {
      throw new ApiError(
        409,
        `Possible duplicate: “${dup.businessName}” (${dup.clientCode}) already exists with a matching phone, email or website.`,
      );
    }
  }

  const client = await withCodeRetry("client", "clientCode", (clientCode) =>
    db.client.create({
      data: {
        clientCode,
        businessName,
        businessCategory: sanitize(b.businessCategory),
        contactPerson: sanitize(b.contactPerson),
        phone,
        whatsapp,
        email,
        location: sanitize(b.location),
        city: sanitize(b.city),
        mapsUrl: sanitize(b.mapsUrl),
        websiteUrl,
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
        status: sanitize(b.status) ?? "Lead",
        notes: sanitize(b.notes),
        createdById: user.id,
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "create",
    entity: "client",
    entityId: client.id,
    summary: `Client created: ${client.businessName} (${client.clientCode})`,
    details: { status: client.status },
  });
  if (client.assignedToId && client.assignedToId !== user.id) {
    await notify({
      userId: client.assignedToId,
      title: "Client assigned to you",
      body: `${client.businessName} (${client.clientCode}) was assigned to you by ${user.name}.`,
      type: "info",
      link: "clients",
    });
  }
  return Response.json({ client }, { status: 201 });
});
