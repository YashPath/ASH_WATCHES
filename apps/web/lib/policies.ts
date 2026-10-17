export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? 'support@example.com';
export type Policy = { title: string; intro: string; sections: Array<{ h: string; p: string[] }> };

// Template wording for a small online watch store. The store owner must review it (and have it reviewed by a lawyer) before going live.
export const POLICIES: Record<string, Policy> = {
  shipping: {
    title: 'Shipping & delivery',
    intro: 'How and when your watch reaches you.',
    sections: [
      { h: 'Where we ship', p: ['We ship across India. Orders are dispatched from our workshop after a quality check and a protective packing step.'] },
      { h: 'Timelines', p: ['Orders are usually dispatched within 2 business days. Delivery typically takes 3 to 7 business days depending on your PIN code. You will see the status change to Shipped in your account when it leaves us.'] },
      { h: 'Shipping cost', p: ['Delivery is free on all orders. The price you see at checkout is the price you pay.'] },
      { h: 'Cash on delivery', p: ['Cash on delivery is available at checkout. Please keep the exact amount ready for the courier. Orders that are repeatedly refused at the door may lose access to cash on delivery.'] }
    ]
  },
  returns: {
    title: 'Returns & refunds',
    intro: 'If something is not right, tell us and we will make it right.',
    sections: [
      { h: '7-day return window', p: ['You may return an unworn watch in its original packaging within 7 days of delivery. Contact us first so we can arrange a pick-up.'] },
      { h: 'Damaged or wrong item', p: ['If your watch arrives damaged or is not what you ordered, write to us within 48 hours with photos and we will replace it or refund you in full.'] },
      { h: 'How refunds work', p: ['Online payments are refunded to the original payment method within 5 to 10 business days after we receive and inspect the watch. Cash on delivery orders are refunded by bank transfer to an account you provide.'] },
      { h: 'Cancelling an order', p: ['You can cancel from your account while an order is still pending. Once it has shipped, use the return process instead.'] }
    ]
  },
  warranty: {
    title: 'Warranty',
    intro: 'What is covered and for how long.',
    sections: [
      { h: 'Coverage', p: ['Every ASH_ watch carries a 2-year warranty against manufacturing defects in the movement and case.'] },
      { h: 'What is not covered', p: ['Accidental damage, water damage on non-water-resistant models, unauthorised repairs and normal wear on straps are not covered.'] },
      { h: 'Making a claim', p: ['Email us your order number and a short description. We will arrange inspection and repair or replacement.'] }
    ]
  },
  privacy: {
    title: 'Privacy policy',
    intro: 'What we collect, why, and the choices you have.',
    sections: [
      { h: 'What we collect', p: ['Your name, email, delivery address and phone number so we can process and deliver orders; your order history; and basic technical logs for security.'] },
      { h: 'Payments', p: ['Card and UPI details are handled by Stripe. We never see or store them.'] },
      { h: 'How we use it', p: ['To fulfil orders, send order and account emails, prevent fraud and abuse, and improve the store. We do not sell your personal data.'] },
      { h: 'Cookies', p: ['We use one strictly necessary cookie to keep you signed in securely. We do not use advertising cookies.'] },
      { h: 'Your choices', p: ['You can ask us to correct or delete your account data at any time by emailing us. Some order records must be kept for accounting and legal reasons.'] }
    ]
  },
  terms: {
    title: 'Terms of service',
    intro: 'The rules for using this store.',
    sections: [
      { h: 'Orders', p: ['An order is accepted when we confirm it. We may cancel an order if an item is out of stock or the price was shown in error, and we will refund anything you paid.'] },
      { h: 'Pricing', p: ['Prices are in Indian rupees and include applicable taxes unless stated otherwise.'] },
      { h: 'Accounts', p: ['You are responsible for keeping your password secret and for activity on your account.'] },
      { h: 'Images and models', p: ['The 3D view is an illustrative model. Colours and proportions can differ slightly from the physical watch.'] }
    ]
  }
};
