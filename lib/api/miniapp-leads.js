import { requireAdmin } from './_max.js';
import { supabaseFetch } from './_supabase.js';

const CRM_STATUSES = new Set([
  'new',
  'in_work',
  'measure_scheduled',
  'estimate_sent',
  'ordered',
  'rejected',
  'duplicate'
]);

function sanitizeText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeStatus(value) {
  const status = sanitizeText(value, 80);
  return CRM_STATUSES.has(status) ? status : 'new';
}

function filterLeads(leads, query) {
  const status = sanitizeText(query?.status || 'all', 80);
  const search = sanitizeText(query?.search || '', 120).toLowerCase();
  const campaign = sanitizeText(query?.campaign || '', 160).toLowerCase();
  const source = sanitizeText(query?.source || '', 160).toLowerCase();

  return leads.filter((lead) => {
    const crmStatus = lead.crm_status || 'new';
    if (status && status !== 'all' && crmStatus !== status) return false;

    if (campaign) {
      const value = String(lead.utm_campaign || '').toLowerCase();
      if (!value.includes(campaign)) return false;
    }

    if (source) {
      const value = String(lead.source || lead.utm_source || '').toLowerCase();
      if (!value.includes(source)) return false;
    }

    if (search) {
      const haystack = [
        lead.id,
        lead.name,
        lead.phone,
        lead.address,
        lead.object_type,
        lead.utm_campaign,
        lead.utm_content,
        lead.source,
        lead.comment,
        lead.crm_note,
        lead.max_username
      ].map((x) => String(x || '').toLowerCase()).join(' ');
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

function buildSummary(leads) {
  const byStatus = Object.fromEntries(Array.from(CRM_STATUSES).map((status) => [status, 0]));
  let totalEstimate = 0;
  let withPhone = 0;
  const campaigns = new Set();

  for (const lead of leads) {
    const status = CRM_STATUSES.has(lead.crm_status) ? lead.crm_status : 'new';
    byStatus[status] = (byStatus[status] || 0) + 1;
    totalEstimate += Number(lead.estimated_total || 0);
    if (lead.phone) withPhone += 1;
    if (lead.utm_campaign) campaigns.add(lead.utm_campaign);
  }

  return {
    total: leads.length,
    byStatus,
    totalEstimate,
    withPhone,
    campaigns: campaigns.size
  };
}

async function handleGet(req, res) {
  const limit = Math.min(500, Math.max(1, Number(req.query?.limit || 200)));
  const rows = await supabaseFetch(`max_miniapp_leads?select=*&order=created_at.desc&limit=${limit}`, {
    method: 'GET'
  });
  const leads = filterLeads(Array.isArray(rows) ? rows : [], req.query || {});
  return res.status(200).json({ ok: true, leads, summary: buildSummary(leads), limit });
}

async function handleUpdate(req, res) {
  const id = Number(req.body?.id || req.query?.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Некорректный id заявки' });
  }

  let currentRows = null;
  try {
    currentRows = await supabaseFetch(`max_miniapp_leads?select=id,crm_status,crm_result&id=eq.${encodeURIComponent(id)}&limit=1`, {
      method: 'GET'
    });
  } catch (error) {
    const message = String(error.message || '');
    if (!message.includes('PGRST204') && !message.includes('Could not find')) throw error;
    currentRows = await supabaseFetch(`max_miniapp_leads?select=id,crm_status&id=eq.${encodeURIComponent(id)}&limit=1`, {
      method: 'GET'
    });
  }
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) return res.status(404).json({ ok: false, error: 'Заявка не найдена' });

  const crmStatus = normalizeStatus(req.body?.crm_status || req.body?.status || current.crm_status || 'new');
  const crmNote = sanitizeText(req.body?.crm_note || req.body?.note || '', 2000);
  const crmNextAction = sanitizeText(req.body?.crm_next_action || req.body?.next_action || '', 500);
  const updatedAt = new Date().toISOString();

  const crmResult = {
    ...(current.crm_result && typeof current.crm_result === 'object' ? current.crm_result : {}),
    note: crmNote,
    next_action: crmNextAction,
    updated_at: updatedAt
  };

  const fullPatch = {
    crm_status: crmStatus,
    crm_note: crmNote || null,
    crm_next_action: crmNextAction || null,
    crm_updated_at: updatedAt,
    crm_result: crmResult
  };

  const fallbackPatch = {
    crm_status: crmStatus,
    crm_result: crmResult
  };

  let updated = null;
  let mode = 'full';
  try {
    updated = await supabaseFetch(`max_miniapp_leads?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(fullPatch)
    });
  } catch (error) {
    const message = String(error.message || '');
    if (!message.includes('PGRST204') && !message.includes('Could not find')) throw error;
    mode = 'fallback';
    updated = await supabaseFetch(`max_miniapp_leads?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(fallbackPatch)
    });
  }

  return res.status(200).json({ ok: true, mode, lead: Array.isArray(updated) ? updated[0] : updated });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'PATCH' || req.method === 'POST') return handleUpdate(req, res);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
