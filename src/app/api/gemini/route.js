import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { contents, systemInstruction } = await request.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key is missing.' }, { status: 500 });
    }

    const apiModel = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';
    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`;

    const bodyData = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2500 }
    };

    if (systemInstruction) {
      bodyData.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `API Error ${response.status}: ${errText}` }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
