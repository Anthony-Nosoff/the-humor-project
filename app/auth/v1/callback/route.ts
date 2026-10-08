import { NextResponse } from "next/server";

function buildAuthSuccessResponse(accessToken: string) {
    const response = NextResponse.json({ message: "Authentication successful" });
    response.cookies.set("supabase_access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
    });
    return response;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get("access_token");

    if (!accessToken) {
    return NextResponse.json(
        {
        error: "Access token is missing in query params. If Supabase returned it in the URL hash (#access_token), send it to this route via POST from a client callback page.",
        url: request.url,
        },
        { status: 400 }
    );
    }

    return buildAuthSuccessResponse(accessToken);
}

export async function POST(request: Request) {
    let accessToken: string | undefined;

    try {
    const body = await request.json();
    if (typeof body?.access_token === "string") {
        accessToken = body.access_token;
    }
    } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (!accessToken) {
    return NextResponse.json({ error: "access_token is required" }, { status: 400 });
    }

    return buildAuthSuccessResponse(accessToken);
}