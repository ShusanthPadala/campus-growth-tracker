import { WORKSHOP } from './constants';
/** Share-link only: opens WhatsApp with pre-filled text. Nothing is sent automatically and no WhatsApp API is used. */
export const whatsappShareUrl = (link: string, intro?: string) =>
  'https://wa.me/?text=' + encodeURIComponent(`${intro ?? `Join the free workshop “${WORKSHOP}”:`} ${link}`);
