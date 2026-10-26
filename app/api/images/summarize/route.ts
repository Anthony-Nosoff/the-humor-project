import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/app/supabase/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { imageId, imagePath, mimeType, imageBase64 } = body || {};

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

    let base64Data = imageBase64;
    let resolvedMimeType = mimeType || 'image/jpeg';

    // If imageBase64 was not provided directly, try to download from Supabase storage
    if (!base64Data && imagePath) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('images')
        .download(imagePath);

      if (downloadError || !fileData) {
        return NextResponse.json(
          {
            error: `Failed to download image from storage: ${
              downloadError?.message || 'File not found'
            }`,
          },
          { status: 400 }
        );
      }

      resolvedMimeType = fileData.type || resolvedMimeType;
      const arrayBuffer = await fileData.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
    }

    if (!base64Data) {
      return NextResponse.json(
        { error: 'Image data or valid imagePath is required' },
        { status: 400 }
      );
    }

    // Clean base64 data if it includes a data URL prefix
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }

    // Using Gemini 2.5 Flash endpoint via REST API (matching SimpleTextGeminiExample.html)
    const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const promptText =
      'Provide a concise, descriptive summary of this image, highlighting key visual elements and humor or meme context if applicable.';

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: resolvedMimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
    };

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const errorMsg =
        geminiData.error?.message ||
        `Gemini API HTTP error! status: ${geminiResponse.status}`;
      return NextResponse.json({ error: errorMsg }, { status: geminiResponse.status });
    }

    // Extract text from the response structure (matching SimpleTextGeminiExample.html)
    const summary =
      geminiData.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text)
        .filter(Boolean)
        .join('\n')
        .trim() ||
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response.' },
        { status: 502 }
      );
    }

    // Update public.images row with the generated summary description
    const { error: updateError } = await supabase
      .from('images')
      .update({ description: summary })
      .eq('id', imageId);

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          summary,
          error: `Generated summary but failed to update public.images: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageId,
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
