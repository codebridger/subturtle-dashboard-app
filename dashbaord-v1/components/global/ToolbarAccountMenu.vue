<script setup lang="ts">
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/vue";

const router = useRouter();

function handleLogout() {
  router.push("/auth/login");
}
</script>

<template>
  <div class="group inline-flex items-center justify-center text-right">
    <Menu as="div" class="relative h-9 w-9 text-left" v-slot="{ close }">
      <MenuButton as="template">
        <button
          type="button"
          class="group-hover:ring-primary-500 dark:ring-offset-muted-900 inline-flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-transparent transition-all duration-300 group-hover:ring-offset-4"
        >
          <div
            class="relative inline-flex h-9 w-9 items-center justify-center rounded-full"
          >
            <img
              :src="profileInfo?.gPicture || '/img/avatars/2.svg'"
              class="max-w-full rounded-full object-cover shadow-sm dark:border-transparent"
              alt=""
            />
          </div>
        </button>
      </MenuButton>

      <Transition
        class="z-[9999]"
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="transform scale-95 opacity-0"
        enter-to-class="transform scale-100 opacity-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="transform scale-100 opacity-100"
        leave-to-class="transform scale-95 opacity-0"
      >
        <MenuItems
          class="divide-muted-100 border-muted-200 dark:divide-muted-700 dark:border-muted-700 dark:bg-muted-800 absolute end-0 mt-2 w-64 origin-top-right divide-y rounded-md border bg-white shadow-lg focus:outline-none"
        >
          <div class="p-6 text-center">
            <div
              class="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full"
            >
              <img
                :src="profileInfo?.gPicture || '/img/avatars/2.svg'"
                class="max-w-full rounded-full object-cover shadow-sm dark:border-transparent"
                alt=""
              />
            </div>
            <div class="mt-3">
              <h6
                v-if="profileInfo?.name"
                class="font-heading text-muted-800 text-sm font-medium dark:text-white"
              >
                {{ profileInfo?.name }}
              </h6>
              <p class="text-muted-400 mb-4 font-sans text-xs">
                {{ authUser?.email }}
              </p>
              <!-- <BaseButton
                to="/layouts/profile-edit"
                shape="curved"
                class="w-full"
                @click.passive="close"
                >Manage Account</BaseButton> -->
            </div>
          </div>

          <div class="p-6">
            <BaseButton
              @click.passive="
                close();
                handleLogout();
              "
              shape="curved"
              class="w-full"
            >
              Logout
            </BaseButton>
          </div>
        </MenuItems>
      </Transition>
    </Menu>
  </div>
</template>
