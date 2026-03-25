export async function POST(request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const response = await fetch('https://api.openai.com/v1/realtime/transcription_sessions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input_audio_format: 'pcm16',
      input_audio_transcription: {
        model: 'gpt-4o-mini-transcribe',
        language: 'en',
      },
      turn_detection: {
        type: 'server_vad',
        silence_duration_ms: 200,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('[session] OpenAI error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create session' }), {
      status: 502, headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = await response.json();
  return new Response(JSON.stringify({ client_secret: data.client_secret }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
