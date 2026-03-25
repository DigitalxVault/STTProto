import OpenAI, { toFile } from 'openai';

const MIME_TO_EXT = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/ogg;codecs=opus': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

export async function POST(request) {
  // Guard 1: API key must be present
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: 'Server misconfiguration: OPENAI_API_KEY is not set.' },
      { status: 500 }
    );
  }

  // Guard 2: Content-Type must be multipart/form-data
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return Response.json(
      { error: 'Request must use multipart/form-data.' },
      { status: 400 }
    );
  }

  // Guard 3: Parse formData
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: 'Failed to parse form data.' },
      { status: 400 }
    );
  }

  // Guard 4: File field must be present and be a File object
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json(
      { error: 'Missing required field: file (must be an audio file).' },
      { status: 400 }
    );
  }

  // Guard 5: File size must not exceed 4 MB
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json(
      { error: 'Audio file exceeds maximum size of 4 MB.' },
      { status: 413 }
    );
  }

  // Resolve file extension from MIME type
  const mimeType = file.type || 'audio/webm';
  const ext = MIME_TO_EXT[mimeType] ?? 'webm';

  // Transcribe via Whisper
  try {
    const openai = new OpenAI(); // reads OPENAI_API_KEY from process.env automatically

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioFile = await toFile(buffer, `audio.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });

    return Response.json({ text: transcription.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json(
      { error: `Transcription failed: ${message}` },
      { status: 500 }
    );
  }
}
