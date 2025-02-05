<template>
  <div class="relative flex w-full flex-col items-center justify-center space-y-10 overflow-hidden p-5 sm:min-h-screen md:justify-start md:p-10">
    <div class="dropdown ms-auto w-max">
      <client-only>
        <Popper :placement="store.rtlClass === 'rtl' ? 'bottom-start' : 'bottom-end'" offsetDistance="8">
          <CLButton
            type="button"
            rounded="lg"
            class="flex items-center gap-2.5 border border-white-dark/30 px-2 py-1.5 text-white-dark hover:border-primary hover:text-primary dark:bg-black"
          >
            <div>
              <img :src="currentFlag" alt="image" class="h-5 w-5 rounded-full object-cover" />
            </div>
            <div class="text-base font-bold uppercase">{{ store.locale }}</div>
            <span class="shrink-0">
              <icon-caret-down />
            </span>
          </CLButton>

          <template #content="{ close }">
            <ul class="grid w-[280px] grid-cols-2 gap-2 !px-2 font-semibold text-dark dark:text-white-dark dark:text-white-light/90">
              <template v-for="item in store.languageList" :key="item.code">
                <li>
                  <a
                    type="button"
                    class="w-full hover:text-primary"
                    :class="{ 'bg-primary/10 text-primary': store.locale === item.code }"
                    @click="
                      changeLanguage(item);
                      close();
                    "
                  >
                    <img class="h-5 w-5 rounded-full object-cover" :src="`/assets/images/flags/${item.code.toUpperCase()}.svg`" alt="" />
                    <span class="ltr:ml-3 rtl:mr-3">{{ item.name }}</span>
                  </a>
                </li>
              </template>
            </ul>
          </template>
        </Popper>
      </client-only>
    </div>

    <div class="flex w-full flex-col items-center justify-between space-y-5 sm:flex-row md:space-x-10">
      <img src="/assets/images/connect-image.png" alt="image" class="ml-0 w-9/12 md:-ml-1 md:w-1/2" />
      <div class="flex w-full flex-col items-center justify-center space-y-5 md:w-7/12 md:space-y-10">
        <h4 class="text-center text-2xl font-extrabold uppercase !leading-snug text-primary dark:text-primary-light xl:text-4xl">A Few Steps Left</h4>
        <p class="text-center text-lg font-bold text-white-dark dark:text-white-light md:text-base">
          Log in with Instagram and set your permissions. <br />
          Once that is done, you are all set to connect to xxx!
        </p>
        <form class="w-full dark:text-white xl:w-9/12" @submit.prevent="router.push('/')">
          <CLButton color="gradient" shadow uppercase block> go to instagram </CLButton>
        </form>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import appSetting from '@/app-setting';
  import { useRouter } from 'vue-router';
  import { useAppStore } from '@/stores/index';
  const router = useRouter();
  const store = useAppStore();

  useHead({ title: 'Add Instagram Account' });
  const { t } = useI18n();

  definePageMeta({
    layout: 'spotlight',
    title: () => t('instagram-status'),
    // @ts-ignore
    middleware: ['auth'],
  });

  const { setLocale } = useI18n();

  // multi language
  const changeLanguage = (item: any) => {
    appSetting.toggleLanguage(item, setLocale);
  };

  const currentFlag = computed(() => {
    return `/assets/images/flags/${store.locale?.toUpperCase()}.svg`;
  });
</script>
