export const GA_TRACKING_ID = process.env.NEXT_PUBLIC_GA_ID as string;

// https://developers.google.com/analytics/devguides/collection/gtagjs/pages
export const pageview = (url: string) => {
  window.gtag('config', GA_TRACKING_ID, {
    page_path: url,
  })
}

// https://developers.google.com/analytics/devguides/collection/gtagjs/events
export const event = ({ action, event_category, event_label, value }: { action: string, event_category: string, event_label: string, value: string }) => {
  window.gtag('event', action, {
    event_category,
    event_label,
    value,
  })
}
