import { isVisitFieldRef, type LeadFieldRef } from "@/lib/leads/fields";
import { formatDate, formatTime } from "@/lib/visits/time";

/** What a scheduled message knows about the visit it is for. */
export interface VisitContext {
  visit_type: string | null;
  visit_date: string | null;
  start_time: string | null;
  end_time: string | null;
  poc_name: string | null;
  village_names: string[];
  experience_names: string[];
  /** The guest's feedback token. Only the token goes in a URL-button variable, never the whole URL. */
  feedback_token: string | null;
}

const MAX_VALUE_LENGTH = 1024;

/**
 * WhatsApp rejects template variable values containing newlines, tabs or runs of 4+ spaces,
 * and caps their length. Free text from the visit record is normalised here.
 */
export function cleanTemplateValue(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, MAX_VALUE_LENGTH);
}

/** The value for a `visit:<field>` reference, or null when the visit has nothing for it. */
export function readVisitField(visit: VisitContext | null | undefined, ref: LeadFieldRef): string | null {
  if (!visit || !isVisitFieldRef(ref)) return null;
  const field = ref.slice(6);
  let value: string | null;
  switch (field) {
    case "visit_type":
      value = visit.visit_type;
      break;
    case "visit_date":
      value = visit.visit_date ? formatDate(visit.visit_date) : null;
      break;
    case "start_time":
      value = visit.start_time ? formatTime(visit.start_time) : null;
      break;
    case "end_time":
      value = visit.end_time ? formatTime(visit.end_time) : null;
      break;
    case "poc_name":
      value = visit.poc_name;
      break;
    case "village_names":
      value = visit.village_names.length ? visit.village_names.join(", ") : null;
      break;
    case "experience_names":
      value = visit.experience_names.length ? visit.experience_names.join(", ") : null;
      break;
    case "feedback_token":
      value = visit.feedback_token;
      break;
    default:
      value = null;
  }
  if (value === null) return null;
  const cleaned = cleanTemplateValue(value);
  return cleaned || null;
}
