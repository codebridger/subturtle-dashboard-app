import { authentication, dataProvider, functionProvider } from '@modular-rest/client';
import { toastError } from 'pilotui/toast';
import { defineStore } from 'pinia';

import { COLLECTIONS, DATABASE, type FreemiumAllocationType, type ProfileType, type SubscriptionType } from '~/types/database.type';

export const useProfileStore = defineStore('profile', () => {
    const authUser = computed(() => authentication.user);
    const isLogin = computed(() => authentication.isLogin);

    // profile
    const userDetail = ref<ProfileType>();
    const profilePictureBase64 = ref<string>('');
    const profilePicture = computed(() => profilePictureBase64.value || userDetail.value?.gPicture || '');
    const email = computed(() => authUser.value?.email);

    const PICTURE_CACHE_PREFIX = 'profile_picture_b64:';
    const PICTURE_FAIL_PREFIX = 'profile_picture_fail:';
    const PICTURE_FAIL_TTL_MS = 24 * 60 * 60 * 1000;
    const CACHE_RESIZE_PX = 96;
    const CACHE_JPEG_QUALITY = 0.85;

    type PictureCacheEntry = { url: string; dataUri: string };
    type PictureFailEntry = { url: string; ts: number };

    function pictureCacheKey(userId: string) {
        return `${PICTURE_CACHE_PREFIX}${userId}`;
    }

    function pictureFailKey(userId: string) {
        return `${PICTURE_FAIL_PREFIX}${userId}`;
    }

    function readCachedPicture(userId: string): PictureCacheEntry | null {
        try {
            const raw = localStorage.getItem(pictureCacheKey(userId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed.url === 'string' && typeof parsed.dataUri === 'string') {
                return parsed;
            }
        } catch {
            // corrupt entry — fall through to null
        }
        return null;
    }

    function writeCachedPicture(userId: string, entry: PictureCacheEntry) {
        try {
            localStorage.setItem(pictureCacheKey(userId), JSON.stringify(entry));
        } catch {
            // QuotaExceededError — leave ref populated for the session, skip persistence
        }
    }

    function isPictureMarkedFailed(userId: string, url: string): boolean {
        try {
            const raw = localStorage.getItem(pictureFailKey(userId));
            if (!raw) return false;
            const parsed = JSON.parse(raw) as PictureFailEntry;
            if (parsed?.url !== url) return false;
            if (Date.now() - parsed.ts > PICTURE_FAIL_TTL_MS) {
                localStorage.removeItem(pictureFailKey(userId));
                return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    function markPictureFailed(userId: string, url: string) {
        try {
            localStorage.setItem(pictureFailKey(userId), JSON.stringify({ url, ts: Date.now() }));
        } catch {
            // ignore
        }
    }

    async function downloadAndCachePicture(userId: string, url: string): Promise<void> {
        const dataUri = await new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = CACHE_RESIZE_PX;
                    canvas.height = CACHE_RESIZE_PX;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return reject(new Error('Canvas 2D unavailable'));
                    ctx.drawImage(img, 0, 0, CACHE_RESIZE_PX, CACHE_RESIZE_PX);
                    resolve(canvas.toDataURL('image/jpeg', CACHE_JPEG_QUALITY));
                } catch (e) {
                    reject(e);
                }
            };
            img.onerror = () => reject(new Error('Failed to load profile image'));
            img.src = url;
        });

        profilePictureBase64.value = dataUri;
        writeCachedPicture(userId, { url, dataUri });
    }

    // subscription
    const isFreemium = ref(false);
    const isSubscriptionFetching = ref(true);
    const activeSubscription = ref<SubscriptionType | null>(null);
    const freemiumAllocation = ref<FreemiumAllocationType | null>(null);

    function fetchSubscription() {
        isSubscriptionFetching.value = true;

        return functionProvider
            .run<SubscriptionType | FreemiumAllocationType>({
                name: 'getSubscriptionDetails',
                args: {
                    userId: authUser.value?.id,
                },
            })
            .then((res) => {
                isFreemium.value = res.is_freemium;

                if (!res.is_freemium) {
                    activeSubscription.value = res;
                } else {
                    freemiumAllocation.value = res as FreemiumAllocationType;
                }
            })
            .catch((res) => {
                console.error('Error fetching subscription:', res);
                toastError(res.error || 'Unable to fetch subscription details', { position: 'top-end' });
            })
            .finally(() => {
                isSubscriptionFetching.value = false;
            });
    }

    function logout() {
        const userId = authUser.value?.id;
        if (userId) {
            try {
                localStorage.removeItem(pictureCacheKey(userId));
                localStorage.removeItem(pictureFailKey(userId));
            } catch {
                // ignore
            }
        }
        profilePictureBase64.value = '';
        authentication.logout();
        userDetail.value = undefined;
    }

    function getProfileInfo() {
        return dataProvider
            .findOne<ProfileType>({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
            })
            .then((profile) => {
                const userId = authentication.user?.id;
                const gPicture = profile?.gPicture;
                const knownFailed = !!(userId && gPicture && isPictureMarkedFailed(userId, gPicture));

                // If we already know this URL is broken, strip it before exposing the profile
                // to Vue — that way ProfileButton never renders the doomed <img :src>.
                userDetail.value = knownFailed ? { ...profile, gPicture: '' } : profile;

                if (userId && gPicture && !knownFailed) {
                    const cached = readCachedPicture(userId);
                    if (cached && cached.url === gPicture) {
                        profilePictureBase64.value = cached.dataUri;
                    } else {
                        // No cache or URL drifted — clear stale ref, fire-and-forget re-download.
                        // UI falls back to gPicture URL until the encode completes.
                        profilePictureBase64.value = '';
                        downloadAndCachePicture(userId, gPicture).catch(() => {
                            // The CORS image fetch failed — remember this URL is broken so we
                            // don't keep retrying, and drop gPicture from local state so
                            // renderers fall through to the placeholder.
                            markPictureFailed(userId, gPicture);
                            if (userDetail.value && userDetail.value.gPicture === gPicture) {
                                userDetail.value = { ...userDetail.value, gPicture: '' };
                            }
                        });
                    }
                } else {
                    // No gPicture (or we just stripped it) — drop any stale cached base64 so
                    // ProfileButton falls through to its placeholder.
                    profilePictureBase64.value = '';
                    if (userId && !gPicture) {
                        try { localStorage.removeItem(pictureCacheKey(userId)); } catch {}
                    }
                }

                return profile;
            })
            .catch((error) => {
                toastError(error.error || 'Unable to fetch profile info', { position: 'top-end' });
            });
    }

    // bootstrap the profile store
    function bootstrap() {
        return Promise.all([
            // Fetch profile info
            getProfileInfo(),
            // Fetch subscription details
            fetchSubscription(),
        ]);
    }

    function loginWithLastSession() {
        return authentication
            .loginWithLastSession()
            .then(() => {
                // Only fetch protected user data when this is a real user session.
                // Anonymous tokens may legitimately be in localStorage (other tabs,
                // login screen priming) — don't logout/clear them, just skip bootstrap.
                if (authentication.user?.type !== 'user') {
                    return null;
                }
                const userToken = authentication.getToken;
                return bootstrap()
                    .then(() => {
                        // Defense-in-depth: re-save the user token after bootstrap.
                        // External actors (chrome extension content scripts, other
                        // tabs mid-anonymous flow) can overwrite localStorage.token
                        // between saveSession and bootstrap completion.
                        if (userToken && authentication.user?.type === 'user') {
                            localStorage.setItem('token', userToken);
                        }
                    })
                    .catch((error) => {
                        const message = (error?.error || error?.message || '').toString().toLowerCase();
                        if (message.includes('user not found') || message.includes('authentication')) {
                            authentication.logout();
                        }
                        throw error;
                    });
            })
            .catch(() => null);
    }

    function updateProfile(profileData: { name?: string; profileImage?: File; preferences?: Record<string, boolean>; timeZone?: string }) {
        const updatePayload: any = {};
        if (profileData.name) updatePayload.name = profileData.name;
        if (profileData.timeZone) updatePayload.timeZone = profileData.timeZone;

        if (Object.keys(updatePayload).length === 0) {
            return Promise.resolve(userDetail.value);
        }

        return dataProvider
            .updateOne({
                database: DATABASE.USER_CONTENT,
                collection: COLLECTIONS.PROFILE,
                query: {
                    refId: authentication.user?.id,
                },
                update: updatePayload,
            })
            .then((res) => {
                if (userDetail.value) {
                    if (profileData.name) userDetail.value.name = profileData.name;
                    if (profileData.timeZone) userDetail.value.timeZone = profileData.timeZone;
                }
                return res;
            });
    }

    return {
        authUser,
        userDetail,
        isLogin,
        profilePicture,
        email,

        activeSubscription,
        isSubscriptionFetching,
        isFreemium,
        freemiumAllocation,
        fetchSubscription,

        logout,
        getProfileInfo,
        loginWithLastSession,
        bootstrap,
        updateProfile,
    };
});
