import { authentication, dataProvider } from '@modular-rest/client';

export const isLogin = computed(() => authentication.isLogin);
export const authUser = computed(() => authentication.user);
// export const profileInfo = ref<ProfileType | null>(null);
