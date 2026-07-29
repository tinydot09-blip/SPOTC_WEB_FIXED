import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUNPOD_ENDPOINT_ID =
  process.env.RUNPOD_ENDPOINT_ID?.trim() || '';

const RUNPOD_API_KEY =
  process.env.RUNPOD_API_KEY?.trim() || '';

const runPodBaseUrl = () =>
  `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

const removeDataUrlPrefix = (value: unknown): string => {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();

  if (!trimmed) return '';

  const commaPosition = trimmed.indexOf(',');

  if (
    trimmed.startsWith('data:image/') &&
    commaPosition !== -1
  ) {
    return trimmed.slice(commaPosition + 1);
  }

  return trimmed;
};

const configurationError = () => {
  if (!RUNPOD_ENDPOINT_ID) {
    return 'RUNPOD_ENDPOINT_ID is missing.';
  }

  if (!RUNPOD_API_KEY) {
    return 'RUNPOD_API_KEY is missing.';
  }

  return '';
};

/**
 * POST /api/try-on
 *
 * Starts a RunPod Serverless job.
 */
export async function POST(request: NextRequest) {
  try {
    const missingConfiguration = configurationError();

    if (missingConfiguration) {
      return NextResponse.json(
        {
          success: false,
          error: missingConfiguration,
        },
        { status: 500 },
      );
    }

    const body = await request.json();

    const personImageBase64 = removeDataUrlPrefix(
      body.person_image_base64,
    );

    let garmentImageBase64 = removeDataUrlPrefix(
  body.garment_image_base64,
);

const garmentImageUrl =
  typeof body.garment_image_url === 'string'
    ? body.garment_image_url.trim()
    : '';

if (!garmentImageBase64 && garmentImageUrl) {
  try {
    const garmentResponse = await fetch(garmentImageUrl, {
      cache: 'no-store',
    });

    if (!garmentResponse.ok) {
      throw new Error(
        `Product image returned HTTP ${garmentResponse.status}.`,
      );
    }

    const garmentBuffer = Buffer.from(
      await garmentResponse.arrayBuffer(),
    );

    garmentImageBase64 = garmentBuffer.toString('base64');
  } catch (error) {
    console.error('Downloading garment image failed:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? `Unable to download product image: ${error.message}`
            : 'Unable to download the product image.',
      },
      { status: 400 },
    );
  }
}
if (!garmentImageBase64) {
  return NextResponse.json(
    {
      success: false,
      error: 'The product garment image is missing.',
    },
    { status: 400 },
  );
}

    if (!personImageBase64) {
      return NextResponse.json(
        {
          success: false,
          error: 'The full-body person image is missing.',
        },
        { status: 400 },
      );
    }

    

    const runPodResponse = await fetch(
      `${runPodBaseUrl()}/run`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            person_image_base64: personImageBase64,
            garment_image_base64: garmentImageBase64,

            category:
              typeof body.category === 'string'
                ? body.category
                : 'tops',

            garment_photo_type:
              typeof body.garment_photo_type === 'string'
                ? body.garment_photo_type
                : 'model',

            quality:
              typeof body.quality === 'string'
                ? body.quality
                : 'Balanced',

            tryon_mode:
              typeof body.tryon_mode === 'string'
                ? body.tryon_mode
                : 'Natural / Maskless',

            seed_mode:
              typeof body.seed_mode === 'string'
                ? body.seed_mode
                : 'Random',

            clean_flatlay:
              body.clean_flatlay === true,
          },
        }),
        cache: 'no-store',
      },
    );

    const responseText = await runPodResponse.text();

    let runPodData: Record<string, unknown>;

    try {
      runPodData = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      runPodData = {
        raw_response: responseText,
      };
    }

    if (!runPodResponse.ok) {
      console.error(
        'RunPod start request failed:',
        runPodResponse.status,
        runPodData,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            typeof runPodData.error === 'string'
              ? runPodData.error
              : `RunPod returned HTTP ${runPodResponse.status}.`,
          details: runPodData,
        },
        { status: runPodResponse.status },
      );
    }

    const jobId =
      typeof runPodData.id === 'string'
        ? runPodData.id
        : '';

    if (!jobId) {
      console.error(
        'RunPod response did not contain a job ID:',
        runPodData,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            'RunPod accepted the request but did not return a job ID.',
          details: runPodData,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      job_id: jobId,
      status:
        typeof runPodData.status === 'string'
          ? runPodData.status
          : 'IN_QUEUE',
    });
  } catch (error) {
    console.error('Starting virtual try-on failed:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to start the AI try-on.',
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/try-on?jobId=RUNPOD_JOB_ID
 *
 * Checks the status of an existing RunPod job.
 */
export async function GET(request: NextRequest) {
  try {
    const missingConfiguration = configurationError();

    if (missingConfiguration) {
      return NextResponse.json(
        {
          success: false,
          error: missingConfiguration,
        },
        { status: 500 },
      );
    }

    const jobId =
      request.nextUrl.searchParams.get('jobId')?.trim() || '';

    if (!jobId) {
      return NextResponse.json(
        {
          success: false,
          error: 'RunPod job ID is missing.',
        },
        { status: 400 },
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid RunPod job ID.',
        },
        { status: 400 },
      );
    }

    const runPodResponse = await fetch(
      `${runPodBaseUrl()}/status/${encodeURIComponent(jobId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${RUNPOD_API_KEY}`,
        },
        cache: 'no-store',
      },
    );

    const responseText = await runPodResponse.text();

    let runPodData: Record<string, unknown>;

    try {
      runPodData = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      runPodData = {
        raw_response: responseText,
      };
    }

    if (!runPodResponse.ok) {
      console.error(
        'RunPod status request failed:',
        runPodResponse.status,
        runPodData,
      );

      return NextResponse.json(
        {
          success: false,
          error:
            typeof runPodData.error === 'string'
              ? runPodData.error
              : `RunPod returned HTTP ${runPodResponse.status}.`,
          details: runPodData,
        },
        { status: runPodResponse.status },
      );
    }

    return NextResponse.json({
      success: true,
      ...runPodData,
    });
  } catch (error) {
    console.error('Checking virtual try-on status failed:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to check the AI try-on status.',
      },
      { status: 500 },
    );
  }
}