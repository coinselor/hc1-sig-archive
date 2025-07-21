<template>
  <div class="min-h-screen flex flex-col bg-zinc-100 p-6">
    <div class="max-w-5xl mx-auto w-full">
      <header class="py-4">
        <div class="flex flex-col">
          <h1 class="text-lg md:text-3xl font-sans font-bold tracking-wide">
            <NuxtLink to="/">HC1 SIG Archive </NuxtLink>
          </h1>
          <span class="text-sm tracking-wider pl-[2px] font-mono text-zinc-600"
            >// Meeting Logs</span
          >
        </div>
      </header>

      <slot />

      <footer class="mt-16">
        <div
          class="flex flex-col md:flex-row items-center text-sm font-mono gap-1"
        >
          <div class="flex items-center">
            Built by
            <span class="relative inline-block overflow-hidden group h-5">
              <Icon
                name="pixelarticons:debug"
                class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 pointer-events-none animate-ping z-0"
                size="24px"
              />
              <span
                class="block transition-transform duration-500 ease-out group-hover:-translate-y-full mx-2 relative z-10"
                >Aliens</span
              >
              <span
                class="block absolute left-0 top-full transition-transform duration-500 ease-out group-hover:-translate-y-full mx-2 -mt-[1px] z-10"
                >Roaches</span
              >
            </span>
          </div>

          <span class="pl-2 pr-4">//</span>
          <div class="flex flex-col sm:flex-row items-center">
            Meeting minutes are auto-generated from
            <a
              href="https://matrix.zenon.chat"
              target="_blank"
              rel="noopener noreferrer"
              class="group inline-flex items-center transition-colors duration-300"
            >
              <Icon
                name="ph:matrix-logo"
                class="inline-block mx-1 transition-all duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110 group-hover:text-irc-channel group-hover:animate-tilt"
                size="24px"
              />
              <span
                class="font-medium transition-all duration-300 hover:underline group-hover:animate-tilt"
                >zenon.chat</span
              >
            </a>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>
