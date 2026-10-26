import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageId, description: providedDescription, imagePath, mimeType, imageBase64 } = body || {};

    if (!imageId) {
      return NextResponse.json(
        { error: 'imageId is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'GEMINI_API_KEY is not set. Please add GEMINI_API_KEY to your environment variables.',
        },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    const authHeader = request.headers.get('authorization');
    const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      },
    });

    // If description or image details are not provided, fetch them from the database
    let description = providedDescription;
    let resolvedImagePath = imagePath;

    if (!description || !resolvedImagePath) {
      const { data: imgRow } = await supabase
        .from('images')
        .select('*')
        .eq('id', imageId)
        .single();

      if (imgRow) {
        if (!description) description = imgRow.description;
        if (!resolvedImagePath) resolvedImagePath = imgRow.url;
      }
    }

    let base64Data = imageBase64;
    let resolvedMimeType = mimeType || 'image/jpeg';

    // If base64Data was not provided directly, try to download from Supabase storage if path exists
    if (!base64Data && resolvedImagePath && !resolvedImagePath.startsWith('http')) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('images')
          .download(resolvedImagePath);

        if (!downloadError && fileData) {
          resolvedMimeType = fileData.type || resolvedMimeType;
          const arrayBuffer = await fileData.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
        }
      } catch (err) {
        console.warn('Could not download image from storage for caption generation:', err);
      }
    }

    if (base64Data && base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    const promptText = `You are a hilarious, witty meme creator. Look at this image and its visual details.
${description ? `Context & visual features: "${description}"\n` : ''}
Task: Generate a single funny, relatable, and punchy meme caption that directly relates to the subject and visual features of this image.
Guidelines:
- Caption should be short, punchy, and humorous (e.g. relatable situations, "When you...", "Me trying to...", or a clever punchline).
- It must clearly connect to what is happening or depicted in the image.
- Return ONLY the caption text without quotes, introductory text, explanations, or markdown.`;

    const candidateModels = [
      process.env.GEMINI_MODEL,
      'gemini-2.5-flash',
      'gemini-3.6-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
    ].filter(Boolean) as string[];

    // Build contents payload
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];
    parts.push({ text: promptText });

    if (base64Data) {
      parts.push({
        inline_data: {
          mime_type: resolvedMimeType,
          data: base64Data,
        },
      });
    }

    const payload = {
      contents: [{ parts }],
    };

    let caption = '';
    let lastError = '';

    for (const model of candidateModels) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const geminiData = await geminiResponse.json();

        if (geminiResponse.ok) {
          const rawText =
            geminiData.candidates?.[0]?.content?.parts
              ?.map((part: { text?: string }) => part.text)
              .filter(Boolean)
              .join('\n')
              .trim() ||
            geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

          if (rawText) {
            // Strip outer quotes if model included them
            let cleaned = rawText.trim();
            if (
              (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
              (cleaned.startsWith("'") && cleaned.endsWith("'"))
            ) {
              cleaned = cleaned.slice(1, -1).trim();
            }
            caption = cleaned;
            break;
          }
        } else {
          lastError = geminiData.error?.message || `HTTP error ${geminiResponse.status}`;
          // If model not found (404), continue trying next candidate model
          if (geminiResponse.status === 404) {
            continue;
          }
          break;
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'Fetch error';
      }
    }

    if (!caption) {
      return NextResponse.json(
        { error: lastError || 'Gemini returned an empty caption.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      caption,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
