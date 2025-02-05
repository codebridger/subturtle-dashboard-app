<template>
  <Dropdown :triggerText="''" :offsetDistance="7">
    <template #trigger>
      <IconButton size="lg" :imgUrl="profileStore.profilePicture" />
    </template>

    <template #body="{ close }">
      <ul class="w-[230px] !py-0 font-semibold text-dark dark:text-white-dark dark:text-white-light/90">
        <li>
          <div class="flex items-center px-4 py-4">
            <div class="flex-none">
              <img class="h-10 w-10 rounded-md object-cover" :src="profileStore.profilePicture" alt="" />
            </div>
            <div class="truncate ltr:pl-4 rtl:pr-4">
              <h4 class="text-base">
                {{ profileStore.userDetail?.name }}
                <!-- <span class="rounded bg-success-light px-1 text-xs text-success ltr:ml-2 rtl:ml-2">Pro</span> -->
              </h4>
              <a class="text-black/60 hover:text-primary dark:text-dark-light/60 dark:hover:text-white" href="javascript:;"> {{ profileStore.email }} </a>
            </div>
          </div>
        </li>
        <!-- <li class="cursor-pointer">
          <a class="dark:hover:text-white" @click="close()">
            <Icon name="icon-user" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
            Profile
          </a>
        </li>
        <li class="cursor-pointer">
          <a class="dark:hover:text-white" @click="close()">
            <Icon name="icon-mail" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
            Inbox
          </a>
        </li>
        <li class="cursor-pointer">
          <a class="dark:hover:text-white" @click="close()">
            <Icon name="icon-lock-dots" class="h-4.5 w-4.5 shrink-0 ltr:mr-2 rtl:ml-2" />
            Lock Screen
          </a>
        </li> -->
        <li class="cursor-pointer border-t border-white-light dark:border-white-light/10">
          <a to="/auth/boxed-signin" class="!py-3 text-danger" @click="logout">
            <Icon name="icon-logout" class="h-4.5 w-4.5 shrink-0 rotate-90 ltr:mr-2 rtl:ml-2" />
            Sign Out
          </a>
        </li>
      </ul>
    </template>
  </Dropdown>
</template>

<script lang="ts" setup>
  import { useProfileStore } from '@/stores/profile';
  import { Dropdown, IconButton, Icon } from '@tiny-ideas-ir/lib-vue-components/elements.ts';

  const router = useRouter();

  const profileStore = useProfileStore();

  function logout() {
    profileStore.logout();
    router.push('/auth/login');
  }
</script>
