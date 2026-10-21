import { db } from '@/lib/db'
import { handler, ApiError, requirePermission, requireUser } from '@/lib/permissions'
import { logActivity, sanitize } from '@/lib/helpers'

export const GET = handler(async (req: Request) => {
  const user = await requireUser()
  const settings = await db.businessSettings.findFirst()
  if (!settings) throw new ApiError(404, 'Settings not found')
  // Non-admins get a read-only view without account-management fields
  if (user.role !== 'ADMIN') {
    return Response.json({
      settings: {
        companyName: settings.companyName,
        tagline: settings.tagline,
        website: settings.website,
        email: settings.email,
        phone: settings.phone,
        city: settings.city,
        country: settings.country,
        currency: settings.currency,
        timezone: settings.timezone,
        defaultLanguage: settings.defaultLanguage,
        vatEnabled: settings.vatEnabled,
      },
      canManage: false,
    })
  }
  return Response.json({ settings, canManage: true })
})

export const PUT = handler(async (req: Request) => {
  const user = await requirePermission('settings:write')
  const b = await req.json().catch(() => ({}))
  const settings = await db.businessSettings.findFirst()
  if (!settings) throw new ApiError(404, 'Settings not found')

  const data: Record<string, unknown> = {}
  const stringFields = [
    'companyName', 'tagline', 'email', 'phone', 'website', 'address', 'city', 'country',
    'crNumber', 'vatNumber', 'currency', 'timezone', 'defaultLanguage', 'invoicePrefix',
    'maintInvoicePrefix', 'orderPrefix', 'clientPrefix', 'invoiceFooter', 'paymentInstructions',
  ]
  for (const f of stringFields) if (f in b) data[f] = sanitize(b[f])
  if ('vatEnabled' in b) data.vatEnabled = Boolean(b.vatEnabled)
  if ('vatRate' in b) data.vatRate = Math.max(0, Math.min(100, Number(b.vatRate) || 0))
  if ('schedulerEnabled' in b) data.schedulerEnabled = Boolean(b.schedulerEnabled)

  const updated = await db.businessSettings.update({ where: { id: settings.id }, data })
  await logActivity({
    userId: user.id,
    action: 'update',
    entity: 'settings',
    entityId: settings.id,
    summary: `Business settings updated by ${user.name}`,
    details: { fields: Object.keys(data) },
  })
  return Response.json({ settings: updated })
})
