// Netlify Edge Function: Dynamic OG Image
// Generates a score card SVG for social sharing previews.
// When a user shares their Bot-or-Not score, this renders a gauge image.
//
// Usage: /api/og?score=48&human=52&engine=V8/Blink
// Returns: SVG image with Content-Type: image/svg+xml

const COLORS = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#60a5fa',
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  gradient: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
};

function getCategory(score) {
  if (score <= 15) return { label: 'Likely Human', color: COLORS.green, emoji: '🧑' };
  if (score <= 35) return { label: 'Mostly Human', color: '#84cc16', emoji: '🙂' };
  if (score <= 55) return { label: 'Uncertain', color: COLORS.yellow, emoji: '🤷' };
  if (score <= 80) return { label: 'Bot-like', color: '#f97316', emoji: '🤖' };
  return { label: 'Likely Bot', color: COLORS.red, emoji: '⚙️' };
}

function generateSVG(score, human, engine) {
  const cat = getCategory(score);
  const gaugeWidth = 400;
  const gaugeX = 60;
  const gaugeY = 180;
  const barWidth = (score / 100) * gaugeWidth;
  const emojiSize = 40;

  // Gradient definition for the gauge bar
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="320" viewBox="0 0 520 320">
  <defs>
    <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${COLORS.gradient[0]}"/>
      <stop offset="25%" stop-color="${COLORS.gradient[1]}"/>
      <stop offset="50%" stop-color="${COLORS.gradient[2]}"/>
      <stop offset="75%" stop-color="${COLORS.gradient[3]}"/>
      <stop offset="100%" stop-color="${COLORS.gradient[4]}"/>
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="520" height="320" rx="16" fill="url(#bgGrad)"/>
  <rect width="520" height="320" rx="16" fill="none" stroke="${COLORS.border}" stroke-width="1"/>

  <!-- Title -->
  <text x="260" y="44" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="700" fill="${COLORS.text}">🔍 Scrutari Bot-or-Not™</text>

  <!-- Emoji + Category -->
  <text x="260" y="90" text-anchor="middle" font-size="${emojiSize}">${cat.emoji}</text>
  <text x="260" y="130" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="600" fill="${cat.color}">${cat.label}</text>

  <!-- Score text -->
  <text x="260" y="160" text-anchor="middle" font-family="sans-serif" font-size="13" fill="${COLORS.muted}">${human}% human-like · ${score}% bot-like</text>

  <!-- Gauge background -->
  <rect x="${gaugeX}" y="${gaugeY}" width="${gaugeWidth}" height="18" rx="9" fill="#1e293b" stroke="${COLORS.border}" stroke-width="1"/>
  <!-- Gauge fill -->
  <rect x="${gaugeX}" y="${gaugeY}" width="${barWidth}" height="18" rx="9" fill="url(#gaugeGrad)" opacity="0.8"/>
  <!-- Gauge overlay (inverse) -->
  <rect x="${gaugeX + barWidth}" y="${gaugeY}" width="${gaugeWidth - barWidth}" height="18" rx="9" fill="${COLORS.bg}" opacity="0.4"/>

  <!-- Gauge labels -->
  <text x="${gaugeX}" y="${gaugeY + 34}" font-family="sans-serif" font-size="11" fill="${COLORS.muted}">Human</text>
  <text x="${gaugeX + gaugeWidth / 2}" y="${gaugeY + 34}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${COLORS.muted}">Uncertain</text>
  <text x="${gaugeX + gaugeWidth}" y="${gaugeY + 34}" text-anchor="end" font-family="sans-serif" font-size="11" fill="${COLORS.muted}">Bot</text>

  <!-- Engine -->
  <text x="260" y="240" text-anchor="middle" font-family="sans-serif" font-size="12" fill="${COLORS.muted}">Detected engine: ${engine || 'unknown'}</text>

  <!-- Footer -->
  <text x="260" y="280" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${COLORS.muted}">Check your browser at scrutari.netlify.app</text>
  <text x="260" y="300" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#475569">Free &amp; open source · All tests run client-side</text>
</svg>`;
}

export default async (req, context) => {
  const url = new URL(req.url);
  const score = Math.min(100, Math.max(0, parseInt(url.searchParams.get('score') || '50')));
  const human = 100 - score;
  const engine = url.searchParams.get('engine') || 'unknown';

  const svg = generateSVG(score, human, engine);

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    }
  });
};
