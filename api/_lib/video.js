/* Videollamadas de asesoría (Plan Profesional) con Jitsi Meet (meet.jit.si).
   La sala es aleatoria (frioaustral-<uuid>), la crea el servidor y se abre en una pestaña nueva. */
const crypto = require("crypto");
const { HttpError } = require("./supa");

const JITSI_BASE = "https://meet.jit.si/";
const EARLY_MS = 10 * 60 * 1000;   // se puede entrar 10 min antes
const LATE_MS = 2 * 60 * 60 * 1000; // y hasta 2 h después de la hora
const STATUSES = ["solicitada", "propuesta", "confirmada", "cancelada"];

function newRoom() { return "frioaustral-" + crypto.randomUUID(); }

function parseWhen(v, now = Date.now()) {
  const d = new Date(String(v || ""));
  if (isNaN(d)) throw new HttpError(400, "Elige una fecha y hora válidas.", "bad_when");
  if (d.getTime() < now + 30 * 60 * 1000) throw new HttpError(400, "Propón una hora con al menos 30 minutos de anticipación.", "too_soon");
  if (d.getTime() > now + 90 * 24 * 3600 * 1000) throw new HttpError(400, "Propón una fecha dentro de los próximos 90 días.", "too_far");
  return d.toISOString();
}

function cleanNote(v) {
  const s = String(v || "").trim().slice(0, 500);
  return s || null;
}

function canJoin(v, now = Date.now()) {
  if (!v || v.status !== "confirmada") return false;
  const t = new Date(v.scheduled_at).getTime();
  return now >= t - EARLY_MS && now <= t + LATE_MS;
}

/* Lo que ve cliente o equipo. La sala solo se incluye cuando está confirmada. */
function publicCall(v, now = Date.now()) {
  const confirmed = v.status === "confirmada";
  return {
    id: v.id,
    scheduledAt: v.scheduled_at,
    status: v.status,
    proposedBy: v.proposed_by,
    note: v.note || null,
    canJoin: canJoin(v, now),
    joinFrom: new Date(new Date(v.scheduled_at).getTime() - EARLY_MS).toISOString(),
    room: confirmed ? v.room : null,
    url: confirmed ? JITSI_BASE + v.room : null,
  };
}

module.exports = { newRoom, parseWhen, cleanNote, canJoin, publicCall, STATUSES, JITSI_BASE, EARLY_MS };
