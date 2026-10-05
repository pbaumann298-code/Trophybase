/** User-Agents, die das statische Guide-HTML brauchen. Browser bekommen die App. */
const CRAWLER_UA =
  /googlebot|google-inspectiontool|adsbot-google|mediapartners-google|bingbot|duckduckbot|baiduspider|yandexbot|applebot|twitterbot|facebookexternalhit|facebot|slackbot|linkedinbot|embedly|pinterest|redditbot|whatsapp|telegrambot|discordbot|ia_archiver|semrushbot|ahrefsbot|petalbot|bytespider|gptbot|chatgpt-user|claudebot|anthropic-ai|perplexitybot|amazonbot|ccbot|archive\.org_bot/i;

export function isCrawler(userAgent = '') {
  return CRAWLER_UA.test(String(userAgent || ''));
}
