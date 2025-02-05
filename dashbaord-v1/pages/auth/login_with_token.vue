<template>
  <NuxtWelcome />
</template>

<script setup lang="ts">
const route = useRoute();
const router = useRouter();

onMounted(() => {
  const token = (route.query["token"] as string) || null;
  handleToken(token);
});

async function handleToken(token: string | null) {
  await loginWithLastSession(token!);

  if (isLogin.value) {
    router.push("/dashboard");
  } else {
    router.push("/auth/login");
  }
}
</script>
