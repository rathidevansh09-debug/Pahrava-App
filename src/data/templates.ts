import type { Template } from './types';

// Marathi/Hindi copy should be reviewed by a native speaker before client use.
// Real sending needs Meta-approved templates registered with a WhatsApp BSP.
export const DEFAULT_TEMPLATES: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    key: 'new_event',
    name: { en: 'New event announcement', mr: 'नवीन प्रदर्शनाची घोषणा', hi: 'नई प्रदर्शनी की घोषणा' },
    body: {
      en: 'Namaste {name}! 🎉 PAHRAVA presents {event_name} at {venue} on {dates}. Stalls for {business} start from {price}. Reply YES to book your stall.',
      mr: 'नमस्कार {name}! 🎉 PAHRAVA घेऊन येत आहे {event_name} — {venue} येथे, {dates}. {business} साठी स्टॉल {price} पासून. स्टॉल बुक करण्यासाठी YES असे उत्तर द्या.',
      hi: 'नमस्ते {name}! 🎉 PAHRAVA लेकर आ रहा है {event_name} — {venue} में, {dates}. {business} के लिए स्टॉल {price} से शुरू. स्टॉल बुक करने के लिए YES लिखकर जवाब दें.',
    },
  },
  {
    key: 'early_bird',
    name: { en: 'Early-bird offer', mr: 'अर्ली-बर्ड ऑफर', hi: 'अर्ली-बर्ड ऑफर' },
    body: {
      en: 'Hi {name}, early-bird offer for {event_name} ({dates})! Book this week and get ₹500 off. Limited stalls left at {venue}. Reply BOOK to reserve.',
      mr: 'नमस्कार {name}, {event_name} ({dates}) साठी अर्ली-बर्ड ऑफर! या आठवड्यात बुक करा आणि ₹500 सूट मिळवा. {venue} येथे मर्यादित स्टॉल शिल्लक. राखीव करण्यासाठी BOOK असे उत्तर द्या.',
      hi: 'नमस्ते {name}, {event_name} ({dates}) के लिए अर्ली-बर्ड ऑफर! इस हफ्ते बुक करें और ₹500 की छूट पाएं. {venue} में सीमित स्टॉल बचे हैं. रिज़र्व करने के लिए BOOK लिखें.',
    },
  },
  {
    key: 'booking_confirmation',
    name: { en: 'Booking confirmation', mr: 'बुकिंग निश्चिती', hi: 'बुकिंग कन्फर्मेशन' },
    body: {
      en: 'Thank you {name}! ✅ Your stall #{stall_number} ({stall_type}) at {event_name}, {venue} on {dates} is confirmed. Total: {price}. Balance due: {amount_due}.',
      mr: 'धन्यवाद {name}! ✅ {event_name}, {venue} ({dates}) येथे तुमचा स्टॉल क्र. {stall_number} ({stall_type}) निश्चित झाला आहे. एकूण: {price}. बाकी रक्कम: {amount_due}.',
      hi: 'धन्यवाद {name}! ✅ {event_name}, {venue} ({dates}) में आपका स्टॉल नं. {stall_number} ({stall_type}) कन्फर्म हो गया है. कुल: {price}. बाकी राशि: {amount_due}.',
    },
  },
  {
    key: 'payment_reminder',
    name: { en: 'Payment reminder', mr: 'पेमेंट आठवण', hi: 'भुगतान रिमाइंडर' },
    body: {
      en: 'Hi {name}, a gentle reminder: {amount_due} is pending for stall #{stall_number} at {event_name} ({dates}). Please pay via the link or UPI. Thank you!',
      mr: 'नमस्कार {name}, नम्र आठवण: {event_name} ({dates}) मधील स्टॉल क्र. {stall_number} साठी {amount_due} बाकी आहे. कृपया लिंक किंवा UPI द्वारे भरणा करा. धन्यवाद!',
      hi: 'नमस्ते {name}, विनम्र याद दिलाना: {event_name} ({dates}) में स्टॉल नं. {stall_number} के लिए {amount_due} बाकी है. कृपया लिंक या UPI से भुगतान करें. धन्यवाद!',
    },
  },
  {
    key: 'hold_expiring',
    name: { en: 'Hold expiring reminder', mr: 'होल्ड संपण्याची आठवण', hi: 'होल्ड समाप्ति रिमाइंडर' },
    body: {
      en: 'Hi {name}, your hold on stall #{stall_number} ({stall_type}) for {event_name} expires soon. Pay {price} to confirm, or the stall will be released.',
      mr: 'नमस्कार {name}, {event_name} साठी स्टॉल क्र. {stall_number} ({stall_type}) वरील तुमचे होल्ड लवकरच संपत आहे. निश्चित करण्यासाठी {price} भरा, अन्यथा स्टॉल इतरांसाठी उपलब्ध होईल.',
      hi: 'नमस्ते {name}, {event_name} के लिए स्टॉल नं. {stall_number} ({stall_type}) पर आपका होल्ड जल्द खत्म हो रहा है. कन्फर्म करने के लिए {price} भरें, वरना स्टॉल दूसरों के लिए खुल जाएगा.',
    },
  },
];
