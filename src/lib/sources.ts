export interface Source {
  id: string;
  name: string;
  url: string;
  type: "web" | "rss" | "github" | "reddit" | "huggingface" | "producthunt" | "newsletter";
  category: string;
  enabled: boolean;
  notes: string;
}

export const sources: Source[] = [
  {
    id: "producthunt",
    name: "Product Hunt",
    url: "https://www.producthunt.com/topics/artificial-intelligence",
    type: "producthunt",
    category: "General",
    enabled: true,
    notes: "Lanzamientos diarios de productos IA. Buscar etiquetas: AI, Free, Open Source.",
  },
  {
    id: "github-trending",
    name: "GitHub Trending",
    url: "https://github.com/trending",
    type: "github",
    category: "Open-source",
    enabled: true,
    notes: "Repositorios trending. Filtrar por lenguaje Python/JS y topics: ai, ml, llm.",
  },
  {
    id: "huggingface-models",
    name: "Hugging Face Models",
    url: "https://huggingface.co/models",
    type: "huggingface",
    category: "Modelos",
    enabled: true,
    notes: "Nuevos modelos publicados. Filtrar por trending y últimos 7 días.",
  },
  {
    id: "reddit-localllama",
    name: "r/LocalLLaMA",
    url: "https://www.reddit.com/r/LocalLLaMA/new/",
    type: "reddit",
    category: "Modelos locales",
    enabled: true,
    notes: "Comunidad activa sobre LLMs locales. Buenas detecciones tempranas.",
  },
  {
    id: "reddit-stablediffusion",
    name: "r/StableDiffusion",
    url: "https://www.reddit.com/r/StableDiffusion/new/",
    type: "reddit",
    category: "Imagen IA",
    enabled: true,
    notes: "Nuevas herramientas, modelos y workflows de imagen IA.",
  },
  {
    id: "reddit-aitools",
    name: "r/AItools",
    url: "https://www.reddit.com/r/AItools/new/",
    type: "reddit",
    category: "General",
    enabled: true,
    notes: "Directorio comunitario de herramientas IA.",
  },
  {
    id: "reddit-artificial",
    name: "r/artificial",
    url: "https://www.reddit.com/r/artificial/new/",
    type: "reddit",
    category: "General",
    enabled: true,
    notes: "Noticias y discusiones generales de IA.",
  },
  {
    id: "huggingface-spaces",
    name: "Hugging Face Spaces",
    url: "https://huggingface.co/spaces",
    type: "huggingface",
    category: "Demos",
    enabled: true,
    notes: "Demos y apps IA gratuitas alojadas en HF.",
  },
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://openai.com/blog",
    type: "web",
    category: "Fundaciones",
    enabled: true,
    notes: "Anuncios oficiales de nuevos modelos y features gratuitas.",
  },
  {
    id: "stability-ai-blog",
    name: "Stability AI Blog",
    url: "https://stability.ai/news",
    type: "web",
    category: "Imagen IA",
    enabled: true,
    notes: "Lanzamientos de modelos open-source de imagen, vídeo, audio.",
  },
  {
    id: "replicate-explore",
    name: "Replicate Explore",
    url: "https://replicate.com/explore",
    type: "web",
    category: "APIs",
    enabled: true,
    notes: "Nuevos modelos disponibles como API. Muchos tienen free tier.",
  },
  {
    id: "futuretools",
    name: "FutureTools",
    url: "https://www.futuretools.io/",
    type: "web",
    category: "General",
    enabled: true,
    notes: "Directorio curado de herramientas IA con categorías.",
  },
  {
    id: "theregister-ai",
    name: "The Register - AI",
    url: "https://www.theregister.com/software/ai_ml/",
    type: "web",
    category: "Noticias",
    enabled: false,
    notes: "Noticias de IA con enfoque crítico. Habilitar bajo demanda.",
  },
];

export function getEnabledSources(): Source[] {
  return sources.filter((s) => s.enabled);
}

export function getSourcesByCategory(category: string): Source[] {
  return sources.filter((s) => s.category === category && s.enabled);
}
