-- Rollback for seed.sql. Removes ONLY the rows this migration inserted.
-- Editor-created tools and user data are untouched.

begin;
delete from public.tools where slug in ('bolt-new', 'chatgpt', 'civitai', 'claude', 'comfyui', 'cursor', 'elevenlabs', 'fooocus', 'google-gemini', 'hugging-face-spaces', 'leonardo-ai', 'lm-studio', 'midjourney', 'ollama', 'perplexity-ai', 'pika-labs', 'pinokio', 'replicate', 'runwayml', 'stable-diffusion-webui', 'suno-ai', 'v0-by-vercel');
commit;
