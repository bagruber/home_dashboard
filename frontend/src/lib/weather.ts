export interface WeatherCurrent {
  temperature: number | null;
  weatherCode: number | null;
  isDay: boolean;
  windSpeed: number | null;
}

export interface WeatherHourly {
  time: string[];
  temperature: (number | null)[];
  precipitationProbability: (number | null)[];
  cloudCover: (number | null)[];
  isDay: boolean[];
  weatherCode: (number | null)[];
}

export interface WeatherDay {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  weatherCode: number | null;
  precipitationProbability: number | null;
  sunrise: string | null;
  sunset: string | null;
  hourlyTemperatures: (number | null)[];
}

export interface WeatherResponse {
  current: WeatherCurrent;
  hourly: WeatherHourly;
  forecast: WeatherDay[];
  stale: boolean;
}

export async function fetchWeather(signal?: AbortSignal): Promise<WeatherResponse> {
  const res = await fetch("/api/weather/current", { signal });
  if (!res.ok) throw new Error(`weather: ${res.status}`);
  return res.json();
}

// WMO weather code → short German label and a simple emoji icon.
export function describeWeather(code: number | null, isDay: boolean): { label: string; icon: string } {
  if (code === null) return { label: "—", icon: "·" };
  if (code === 0) return { label: "klar", icon: isDay ? "☀" : "☾" };
  if (code === 1) return { label: "heiter", icon: isDay ? "🌤" : "☾" };
  if (code === 2) return { label: "teils bewölkt", icon: isDay ? "⛅" : "☁" };
  if (code === 3) return { label: "bedeckt", icon: "☁" };
  if (code === 45 || code === 48) return { label: "Nebel", icon: "🌫" };
  if (code >= 51 && code <= 57) return { label: "Niesel", icon: "🌦" };
  if (code >= 61 && code <= 65) return { label: "Regen", icon: "🌧" };
  if (code === 66 || code === 67) return { label: "gefr. Regen", icon: "🌧" };
  if (code >= 71 && code <= 77) return { label: "Schnee", icon: "🌨" };
  if (code >= 80 && code <= 82) return { label: "Schauer", icon: "🌦" };
  if (code === 85 || code === 86) return { label: "Schneeschauer", icon: "🌨" };
  if (code >= 95) return { label: "Gewitter", icon: "⛈" };
  return { label: "—", icon: "·" };
}
