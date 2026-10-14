import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { userRepository } from '../services';

/**
 * The rider's profile photo as something an <Image> can load.
 *
 * `profile.profile_photo_url` is a private-bucket storage path; the bytes sit
 * behind a signed URL that expires in 300s. Each screen used to mint its own on
 * mount, so every navigation showed the avatar placeholder until a round trip
 * finished and then re-downloaded the same picture.
 *
 * The signed URL is therefore cached per storage path for slightly less than
 * its life and shared by every consumer (header avatar, profile sheet), and
 * `cacheKey` is the storage path — the URL's query string changes on every
 * mint, so keying the image cache on the URL would defeat the disk cache. A
 * re-upload produces a new path, which is exactly when both must refresh.
 */
const URL_TTL_MS = 240_000;

let cached: { path: string; url: string; at: number } | null = null;
let inflight: { path: string; promise: Promise<string> } | null = null;

function signedUrlFor(path: string): Promise<string> {
    if (cached && cached.path === path && Date.now() - cached.at < URL_TTL_MS) {
        return Promise.resolve(cached.url);
    }
    if (inflight && inflight.path === path) return inflight.promise;

    const promise = userRepository
        .myPhotoUrl()
        .then((r) => {
            cached = { path, url: r.url, at: Date.now() };
            return r.url;
        })
        .finally(() => {
            if (inflight?.promise === promise) inflight = null;
        });
    inflight = { path, promise };
    return promise;
}

export function useProfilePhoto(): { uri: string; cacheKey: string } | null {
    const path = useAuthStore((s) => s.profile?.profile_photo_url ?? null);
    // Seeded with the last URL even when it has expired: the picture itself
    // comes from expo-image's disk cache by cacheKey, so an expired URL still
    // paints instantly while a fresh one is minted behind it. Starting from
    // null here is what made the avatar flash its placeholder on every screen.
    const [uri, setUri] = useState<string | null>(
        path && cached?.path === path ? cached.url : null,
    );

    useEffect(() => {
        if (!path) {
            setUri(null);
            return;
        }
        let cancelled = false;
        signedUrlFor(path)
            .then((url) => { if (!cancelled) setUri(url); })
            .catch(() => { if (!cancelled) setUri(null); });
        return () => { cancelled = true; };
    }, [path]);

    return path && uri ? { uri, cacheKey: path } : null;
}
