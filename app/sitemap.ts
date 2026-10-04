import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

const PUBLIC_ROUTES = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/service", changeFrequency: "monthly", priority: 0.9 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/reservation", changeFrequency: "weekly", priority: 0.9 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
    { path: "/refund-policy", changeFrequency: "yearly", priority: 0.4 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
    return PUBLIC_ROUTES.map(({ path, changeFrequency, priority }) => ({
        url: new URL(path, SITE_URL).toString(),
        changeFrequency,
        priority,
    }));
}
