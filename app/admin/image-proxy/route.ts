import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (!ipv4) return false;

  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);

  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url');

  if (!rawUrl) {
    return new NextResponse('Missing image URL.', { status: 400 });
  }

  let target: URL;

  try {
    target = new URL(rawUrl);
  } catch {
    return new NextResponse('Invalid image URL.', { status: 400 });
  }

  if (
    target.protocol !== 'https:' ||
    isPrivateHostname(target.hostname)
  ) {
    return new NextResponse('Image URL is not allowed.', { status: 400 });
  }

  try {
    const response = await fetch(target.toString(), {
      method: 'GET',
      cache: 'no-store',
      redirect: 'follow',
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return new NextResponse(
        `Upstream image returned ${response.status}.`,
        { status: 502 },
      );
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    if (!contentType.toLowerCase().startsWith('image/')) {
      return new NextResponse(
        `Upstream URL is not an image (${contentType}).`,
        { status: 415 },
      );
    }

    const contentLength = Number(
      response.headers.get('content-length') || '0',
    );

    if (contentLength > 20 * 1024 * 1024) {
      return new NextResponse('Image is larger than 20 MB.', {
        status: 413,
      });
    }

    const body = await response.arrayBuffer();

    if (body.byteLength > 20 * 1024 * 1024) {
      return new NextResponse('Image is larger than 20 MB.', {
        status: 413,
      });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('Legacy image proxy failed:', error);

    return new NextResponse(
      error instanceof Error
        ? `Image proxy failed: ${error.message}`
        : 'Image proxy failed.',
      { status: 502 },
    );
  }
}