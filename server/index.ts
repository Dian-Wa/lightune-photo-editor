import express from 'express';
import { z } from 'zod';
import { requestRecipe } from './aiRecipe.ts';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

const inputSchema = z.object({ prompt: z.string().trim().min(2).max(500), previewType: z.enum(['portrait', 'landscape', 'food', 'indoor']) });
app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }));
app.post('/api/recipes/generate', async (req, res) => {
  const input = inputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: '请输入 2–500 字的调色描述' });
  try { return res.json(await requestRecipe(input.data.prompt, input.data.previewType)); }
  catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'AI 请求失败' }); }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, '127.0.0.1', () => console.log(`Lightune AI proxy ready on http://127.0.0.1:${port}`));
