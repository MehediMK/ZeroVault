export function getDomainColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 45%)`; // Consistent saturation/lightness
}

export function getInitials(str) {
    if (!str) return "?";
    // Try to extract domain if it looks like a URL
    let label = str;
    try {
        if (str.includes(".") && !str.includes(" ")) {
            // Simple check if it looks like a url
            let s = str;
            if (!s.startsWith("http")) s = "https://" + s;
            const url = new URL(s);
            label = url.hostname.replace("www.", "");
        }
    } catch (e) { /* ignore */ }

    const parts = label.split(/[\s.-]+/);
    if (parts.length >= 2) {
        // If two parts, take first char of each
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    // If one part, take first two chars
    return label.slice(0, 2).toUpperCase();
}

export function timeAgo(dateStr) {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " min ago";
    return "Just now";
}
