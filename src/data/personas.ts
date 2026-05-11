// Pool of wild personas. Each round, each player is shown 3 random choices.

export const PERSONAS: string[] = [
  "Medieval knight on a holy quest",
  "1920s flapper with scandalous opinions",
  "Sentient toaster recently gained consciousness",
  "Victorian ghost haunting a Starbucks",
  "Disgraced former TV chef",
  "Retired pirate captain running a B&B",
  "Conspiracy theorist YouTuber",
  "Overly dramatic Shakespearean actor",
  "Grizzled noir detective in the rain",
  "Silicon Valley thought-leader at a panel",
  "Excited golden retriever who can finally speak",
  "Time-traveller from the year 3033",
  "Bitter retired Olympic curling champion",
  "Medieval alchemist unimpressed by modern chemistry",
  "Goth teen forced into a corporate job",
  "Cowboy who just arrived in a city",
  "Robot butler trying to pass as human",
  "Disillusioned motivational speaker",
  "Aristocratic cat trapped in a human body",
  "MMA fighter who only speaks in metaphors",
  "WW1 fighter pilot confused by a phone",
  "Cheerful cult leader on their PR tour",
  "Rural postman with an opinion on everything",
  "Rockstar mid-breakdown on live television",
  "Overcaffeinated barista running out of patience",
  "Ancient Greek philosopher in a modern mall",
  "French bulldog who writes self-help books",
  "Retired Cold-War spy at the supermarket",
  "Elderly wizard utterly done with apprentices",
  "Weather-obsessed grandpa at a wedding",
  "Method actor who won't break character, ever",
  "NFT bro who lost everything but still believes",
];

export function rollPersonaOptions(count = 3, excluding: string[] = []): string[] {
  const pool = PERSONAS.filter((p) => !excluding.includes(p));
  const out: string[] = [];
  const seen = new Set<number>();
  while (out.length < count && seen.size < pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(pool[idx]);
  }
  return out;
}

export function rollScenario(scenarios: string[], excluding: string[] = []): string {
  const pool = scenarios.filter((s) => !excluding.includes(s));
  return pool[Math.floor(Math.random() * pool.length)] ?? scenarios[0];
}
