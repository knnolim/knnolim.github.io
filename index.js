import {
  createApp,
  ref,
  computed,
  nextTick,
  watch,
  onMounted,
  defineComponent,
} from "vue";

import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

import {
  GraffitiPlugin,
  // GraffitiGetMedia,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffitiActorToHandle,
} from "@graffiti-garden/wrapper-vue";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const CHAT_DIRECTORY_CHANNEL = "group-chats-directory";
  const DEFAULT_GROUP_PHOTO_URL =
  "https://placehold.co/160x160?text=Group";

  const newChatTitle = ref("");
  const myMessage = ref("");
  const actorToAdd = ref("");
  const statusMessage = ref("");
  const messagesEl = ref(null);
  const messageMediaInput = ref(null);
  const pendingMessageMediaFile = ref(null);
  const pendingMessageMediaPreviewUrl = ref("");
  const pendingMessageMediaType = ref("");
  const isMessageMediaPreviewOpen = ref(false);

  const isPresetMenuOpen = ref(false);
  const isPresetEditorOpen = ref(false);
  const isEditingPresets = ref(false);
  const editingPresetIndex = ref(null);

  const presetEmoji = ref("");
  const presetMessage = ref("");
  const presets = ref([]);

  const currentPath = ref("/login");
  const activeChatChannel = ref(null);

  const urlUsername = ref("");
  const isFinishingLogin = ref(false);
  const shouldRedirectHomeAfterLogin = ref(false);

  const localChatObjects = ref([]);
  const localMessageObjects = ref([]);
  const localAddObjects = ref([]);

  const localDeletedChatObjects = ref([]);
  const isEditingChats = ref(false);
  const isDeletingChat = ref(new Set());
  const isLeavingChat = ref(false);

  const isCalendarOpen = ref(false);
  const isRsvpEventsOpen = ref(false);
  const isScheduleEventOpen = ref(false);

  const eventTitle = ref("");
  const eventDate = ref("");
  const eventTime = ref("");
  const eventVisibility = ref("chat");
  const eventRepeat = ref("none");
  const eventRepeatUntil = ref("");

  const localEventObjects = ref([]);
  const localRsvpObjects = ref([]);

  const isStatusesOpen = ref(false);
  const selectedStatusEmoji = ref("😴");
  const customStatusEmoji = ref("");

  const localStatusObjects = ref([]);

  const isGroupDetailsOpen = ref(false);
  const groupChatTitleDraft = ref("");
  const groupChatPhotoDraft = ref("");
  const groupChatPhotoIsMediaDraft = ref(false);
  const selectedGroupPhotoFile = ref(null);

  const DEFAULT_PROFILE_PHOTO_URL =
  "https://placehold.co/160x160?text=You";

  const isSettingsOpen = ref(false);
  const profileNameDraft = ref("");
  const profilePhotoDraft = ref("");
  const profilePhotoIsMediaDraft = ref(false);
  const selectedProfilePhotoFile = ref(null);
  const localProfileObjects = ref([]);

  const readMarkersTick = ref(0);

  function uniqueActors(actors) {
    return [...new Set((actors || []).filter(Boolean))];
  }

  function getChatMembers(chat) {
    if (!chat) return [];

    const members = new Set(chat.value.members || []);
    const chatPublished = chat.value.published || 0;

    const membershipEvents = allDirectoryAddObjects.value
      .filter((memberObj) => {
        return (
          memberObj.value.target === chat.value.channel &&
          memberObj.value.published > chatPublished
        );
      })
      .sort((a, b) => {
        return a.value.published - b.value.published;
      });

    for (const memberObj of membershipEvents) {
      if (memberObj.value.activity === "Add") {
        members.add(memberObj.value.object);
      }

      if (memberObj.value.activity === "Remove") {
        members.delete(memberObj.value.object);
      }
    }

    return [...members];
  }

  function currentUserCanSeeChat(chat) {
    if (!activeActor.value) return false;
    return getChatMembers(chat).includes(activeActor.value);
  }

  function getChatPhotoUrl(chat) {
    return (
      chat?.value?.icon ||
      chat?.value?.photoUrl ||
      DEFAULT_GROUP_PHOTO_URL
    );
  }

  function isGroupPhotoMedia(chat) {
    const icon = chat?.value?.icon || "";

    return Boolean(
      icon &&
        (
          chat?.value?.iconIsMedia ||
          (!icon.startsWith("http://") && !icon.startsWith("https://"))
        )
    );
  }

  function handleGroupPhotoSelect(event) {
    const file = event.target.files?.[0] || null;
    selectedGroupPhotoFile.value = file;
  }

  function clearChatInputs() {
    myMessage.value = "";
    actorToAdd.value = "";
  }

  function readRouteFromUrl() {
    const url = new URL(window.location.href);

    urlUsername.value = url.searchParams.get("username") || "";

    const page = url.searchParams.get("page") || "login";
    const chatId = url.searchParams.get("chatId");

    if (!url.searchParams.has("page")) {
      url.searchParams.set("page", page);
      window.history.replaceState({}, "", url);
    }

    if (page === "chat" && chatId) {
      currentPath.value = `/chat/${chatId}`;
      activeChatChannel.value = chatId;
      return;
    }

    if (page === "login") {
      currentPath.value = "/login";
      activeChatChannel.value = null;
      return;
    }

    currentPath.value = "/home";
    activeChatChannel.value = null;
  }

  function navigateToPage(page, chatId = null) {
    const url = new URL(window.location.href);

    url.searchParams.set("page", page);

    if (chatId) {
      url.searchParams.set("chatId", chatId);
    } else {
      url.searchParams.delete("chatId");
    }

    window.history.pushState({}, "", url);

    clearChatInputs();
    statusMessage.value = "";
    readRouteFromUrl();
    nextTick(scrollToBottom);
  }

  readRouteFromUrl();

  window.addEventListener("popstate", () => {
    clearChatInputs();
    statusMessage.value = "";
    readRouteFromUrl();
    nextTick(scrollToBottom);
  });

  const isLoggedIn = computed(() => {
    return Boolean(session.value);
  });

  watch(isLoggedIn, (loggedIn) => {
    if (
      loggedIn &&
      shouldRedirectHomeAfterLogin.value &&
      currentRoute.value === "login" &&
      !isFinishingLogin.value
    ) {
      shouldRedirectHomeAfterLogin.value = false;
      navigateToPage("home");
    }
  });

  const activeActor = computed(() => {
    return session.value?.actor || "";
  });

  const { handle: activeActorHandle } = useGraffitiActorToHandle(
    () => activeActor.value
  );

  const myGraffitiUsername = computed(() => {
    const handle = activeActorHandle.value || "";

    if (!handle) return "";

    const cleaned = handle.replace(/^@/, "");

    return cleaned.endsWith(".graffiti.actor")
      ? cleaned
      : `${cleaned}.graffiti.actor`;
  });

  const canShowUserData = computed(() => {
    return Boolean(session.value && session.value.actor);
  });

  function isChatMember(chat, actor) {
    if (!chat || !actor) return false;

    const members = Array.isArray(chat.value?.members)
      ? chat.value.members
      : [];

    return members.includes(actor);
  }

  function userVisibleChats(chats) {
    if (!canShowUserData.value) return [];

    return chats.filter((chat) => {
      return isChatMember(chat, activeActor.value);
    });
  }

  const currentRoute = computed(() => {
    if (currentPath.value === "/home") return "home";
    if (currentPath.value === "/login") return "login";
    if (currentPath.value.startsWith("/chat/")) return "chat";
    return "not-found";
  });

  function goHome() {
    navigateToPage("home");
  }

  function goLogin() {
    navigateToPage("login");
  }

  async function maybeFinishLoginFromUsername() {
    readRouteFromUrl();

    if (session.value) return false;
    if (!urlUsername.value) return false;
    if (isFinishingLogin.value) return true;

    isFinishingLogin.value = true;
    statusMessage.value = `Finishing login as ${urlUsername.value}...`;

    try {
      const username = urlUsername.value.trim();

      const actor = username.startsWith("did:")
        ? username
        : await graffiti.handleToActor(username);

      if (!actor) {
        throw new Error("No actor found for username");
      }

      const url = new URL(window.location.href);

      url.searchParams.delete("username");
      url.searchParams.set("actor", actor);

      if (!url.searchParams.has("page")) {
        url.searchParams.set("page", "home");
      }

      window.location.replace(url.toString());
      return true;
    } catch (error) {
      console.error(error);
      isFinishingLogin.value = false;
      statusMessage.value =
        "Could not finish login automatically. Try logging in again.";
      return false;
    }
  }

  async function logIn() {
    statusMessage.value = "";
    shouldRedirectHomeAfterLogin.value = true;

    try {
      await graffiti.login();

      const didRedirect = await maybeFinishLoginFromUsername();

      if (!didRedirect && session.value) {
        shouldRedirectHomeAfterLogin.value = false;
        navigateToPage("home");
      }
    } catch (error) {
      console.error(error);
      shouldRedirectHomeAfterLogin.value = false;
      statusMessage.value = "Login did not finish. Please try again.";
    }
  }

  async function logOut() {
    if (!session.value) return;

    shouldRedirectHomeAfterLogin.value = false;
    statusMessage.value = "";

    try {
      await graffiti.logout(session.value);

      const url = new URL(window.location.href);
      url.searchParams.delete("username");
      url.searchParams.delete("actor");
      url.searchParams.set("page", "login");
      url.searchParams.delete("chatId");
      window.history.replaceState({}, "", url);

      urlUsername.value = "";
      activeChatChannel.value = null;
      currentPath.value = "/login";

      localChatObjects.value = [];
      localMessageObjects.value = [];
      localAddObjects.value = [];
      localEventObjects.value = [];
      localRsvpObjects.value = [];
      localStatusObjects.value = [];

      statusMessage.value = "You are now logged out.";
    } catch (error) {
      console.error(error);
      statusMessage.value = "Logout failed. Please try again.";
    }
  }

  async function requireLogin(message) {
    if (session.value === undefined || isFinishingLogin.value) {
      statusMessage.value =
        "Still checking your login status. Try again in a moment.";
      return false;
    }

    if (!session.value) {
      statusMessage.value = message || "Please log in with Graffiti first.";
      navigateToPage("login");
      return false;
    }

    return true;
  }

  function readMarkerKey(channel) {
    return `muddy-chat-last-read:${activeActor.value}:${channel}`;
  }

  function getLastReadAt(channel) {
    readMarkersTick.value;

    if (!activeActor.value || !channel) return 0;

    const saved = localStorage.getItem(readMarkerKey(channel));
    const parsed = Number(saved);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  function markChatRead(channel = activeChatChannel.value) {
    if (!activeActor.value || !channel) return;

    localStorage.setItem(readMarkerKey(channel), String(Date.now()));
    readMarkersTick.value += 1;
  }

  const {
    objects: chatObjects,
    isFirstPoll: areChatsLoading,
    poll: pollChats,
  } = useGraffitiDiscover(
    () => [CHAT_DIRECTORY_CHANNEL],
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "title",
            "channel",
            "members",
            "published",
          ],
          properties: {
            activity: { const: "Create" },
            type: { const: "Chat" },
            title: { type: "string" },
            channel: { type: "string" },
            members: {
              type: "array",
              items: { type: "string" },
            },
            icon: { type: "string" },
            iconIsMedia: { type: "boolean" },
            photoUrl: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: directoryAddObjects,
    poll: pollDirectoryAdds,
  } = useGraffitiDiscover(
    () => [CHAT_DIRECTORY_CHANNEL],
    {
      properties: {
        value: {
          required: ["activity", "type", "object", "target", "published"],
          properties: {
            activity: { enum: ["Add", "Remove"] },
            type: { const: "Member" },
            object: { type: "string" },
            target: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: eventObjects,
    poll: pollEvents,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "title",
            "date",
            "time",
            "visibility",
            "chatChannel",
            "published",
          ],
          properties: {
            activity: { const: "Create" },
            type: { const: "Event" },
            title: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            visibility: { type: "string" },
            chatChannel: { type: "string" },
            repeat: { type: "string" },
            repeatUntil: { type: "string" },
            originalEventUrl: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: rsvpObjects,
    poll: pollRsvps,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "object",
            "target",
            "response",
            "published",
          ],
          properties: {
            activity: { const: "RSVP" },
            type: { const: "EventRSVP" },
            object: { type: "string" },
            target: { type: "string" },
            response: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: messageObjects,
    isFirstPoll: areMessageObjectsLoading,
    poll: pollMessages,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "content",
            "chatChannel",
            "published",
          ],
          properties: {
            activity: { const: "Send" },
            type: { const: "Message" },
            content: { type: "string" },
            chatChannel: { type: "string" },
            mediaUrl: { type: "string" },
            mediaType: { type: "string" },
            mediaName: { type: "string" },
            mediaSize: { type: "number" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    true
  );

  const {
    objects: addObjects,
    poll: pollAdds,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: ["activity", "type", "object", "target", "published"],
          properties: {
            activity: { enum: ["Add", "Remove"] },
            type: { const: "Member" },
            object: { type: "string" },
            target: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: statusObjects,
    poll: pollStatuses,
  } = useGraffitiDiscover(
    () => (activeChatChannel.value ? [activeChatChannel.value] : []),
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "status",
            "chatChannel",
            "published",
          ],
          properties: {
            activity: { const: "Set" },
            type: { const: "Status" },
            status: { type: "string" },
            chatChannel: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: profileObjects,
    poll: pollProfiles,
  } = useGraffitiDiscover(
    () => (activeActor.value ? [activeActor.value] : []),
    {
      properties: {
        value: {
          required: ["type", "describes", "name", "published"],
          properties: {
            type: { const: "Profile" },
            describes: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            iconIsMedia: { type: "boolean" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const {
    objects: deletedChatObjects,
    poll: pollDeletedChats,
  } = useGraffitiDiscover(
    () => [CHAT_DIRECTORY_CHANNEL],
    {
      properties: {
        value: {
          required: ["activity", "type", "channel", "published"],
          properties: {
            activity: { const: "Delete" },
            type: { const: "Chat" },
            channel: { type: "string" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  function dedupeByUrl(objects) {
    const seen = new Set();

    return objects.filter((object) => {
      if (seen.has(object.url)) return false;
      seen.add(object.url);
      return true;
    });
  }

  const allProfileObjects = computed(() => {
    return dedupeByUrl([...localProfileObjects.value, ...profileObjects.value]);
  });

  const myProfile = computed(() => {
    if (!activeActor.value) return null;

    const profiles = allProfileObjects.value
      .filter((profile) => {
        return profile.value.describes === activeActor.value;
      })
      .sort((a, b) => {
        return b.value.published - a.value.published;
      });

    return profiles[0] || null;
  });

  const myDisplayName = computed(() => {
    return (
      myProfile.value?.value?.name ||
      activeActor.value ||
      "You"
    );
  });

  const myProfilePhotoUrl = computed(() => {
    return (
      myProfile.value?.value?.icon ||
      DEFAULT_PROFILE_PHOTO_URL
    );
  });

  const myProfilePhotoIsMedia = computed(() => {
    return Boolean(
      myProfile.value?.value?.icon &&
        myProfile.value?.value?.iconIsMedia
    );
  });

  function dedupeChatsByChannel(chats) {
    const newestByChannel = new Map();

    for (const chat of dedupeByUrl(chats)) {
      const channel = chat.value.channel;
      const existing = newestByChannel.get(channel);

      if (!existing || chat.value.published > existing.value.published) {
        newestByChannel.set(channel, chat);
      }
    }

    return [...newestByChannel.values()];
  }

  const allChatObjects = computed(() => {
    const chats = dedupeChatsByChannel([
      ...localChatObjects.value,
      ...chatObjects.value,
    ]);

    return chats.filter((chat) => {
      const deletedChat = latestDeletedChatByChannel.value.get(chat.value.channel);

      if (!deletedChat) return true;

      return deletedChat.value.published < chat.value.published;
    });
  });

  const allMessageObjects = computed(() => {
    return dedupeByUrl([
      ...localMessageObjects.value,
      ...messageObjects.value,
      ...homepageMessageObjects.value,
    ]);
  });

  const allAddObjects = computed(() => {
    return dedupeByUrl([...localAddObjects.value, ...addObjects.value]);
  });

  const allDirectoryAddObjects = computed(() => {
    return dedupeByUrl([
      ...localAddObjects.value,
      ...directoryAddObjects.value,
      ...addObjects.value,
    ]);
  });

  const visibleMessageObjects = computed(() => {
    if (!canShowUserData.value) return [];
    if (!activeChat.value) return [];

    return allMessageObjects.value.filter((message) => {
      return message.value.chatChannel === activeChatChannel.value;
    });
  });

  const visibleAddObjects = computed(() => {
    return allAddObjects.value.filter((addObj) => {
      return addObj.value.target === activeChatChannel.value;
    });
  });

  const sortedChats = computed(() => {
    return userVisibleChats(allChatObjects.value).sort((a, b) => {
      return b.value.published - a.value.published;
    });
  });

  const homepageChatChannels = computed(() => {
    return sortedChats.value.map((chat) => chat.value.channel);
  });

  const {
    objects: homepageMessageObjects,
    poll: pollHomepageMessages,
  } = useGraffitiDiscover(
    () => homepageChatChannels.value,
    {
      properties: {
        value: {
          required: [
            "activity",
            "type",
            "content",
            "chatChannel",
            "published",
          ],
          properties: {
            activity: { const: "Send" },
            type: { const: "Message" },
            content: { type: "string" },
            chatChannel: { type: "string" },
            mediaUrl: { type: "string" },
            mediaType: { type: "string" },
            mediaName: { type: "string" },
            mediaSize: { type: "number" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    true
  );

  const sortedMessageObjects = computed(() => {
    return [...visibleMessageObjects.value].sort((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  watch(
    sortedMessageObjects,
    async () => {
      if (currentRoute.value === "chat" && activeChatChannel.value) {
        await scrollChatToLatestMessage();
        markChatRead(activeChatChannel.value);
      }
    },
    { flush: "post" }
  );

  const allEventObjects = computed(() => {
    return dedupeByUrl([...localEventObjects.value, ...eventObjects.value]);
  });

  const allRsvpObjects = computed(() => {
    return dedupeByUrl([...localRsvpObjects.value, ...rsvpObjects.value]);
  });

  function addDaysToDate(dateText, daysToAdd) {
    const parsed = new Date(`${dateText}T00:00`);

    if (Number.isNaN(parsed.getTime())) return dateText;

    parsed.setDate(parsed.getDate() + daysToAdd);

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function repeatStepDays(repeat) {
    if (repeat === "daily") return 1;
    if (repeat === "weekly") return 7;
    if (repeat === "biweekly") return 14;
    return 0;
  }

  function expandRepeatingEvent(event) {
    const repeat = event.value.repeat || "none";
    const stepDays = repeatStepDays(repeat);

    if (!stepDays) return [event];

    const startDate = event.value.date;
    const repeatUntil = event.value.repeatUntil || startDate;

    const expanded = [];
    let currentDate = startDate;
    let occurrenceIndex = 0;

    while (currentDate <= repeatUntil && occurrenceIndex < 100) {
      expanded.push({
        ...event,
        url: `${event.url}#repeat-${occurrenceIndex}`,
        originalUrl: event.url,
        value: {
          ...event.value,
          date: currentDate,
          originalEventUrl: event.url,
          occurrenceIndex,
        },
      });

      currentDate = addDaysToDate(currentDate, stepDays);
      occurrenceIndex += 1;
    }

    return expanded;
  }

  const visibleEventObjects = computed(() => {
    if (!canShowUserData.value) return [];
    if (!activeChat.value) return [];

    return allEventObjects.value
      .filter((event) => {
        return event.value.chatChannel === activeChatChannel.value;
      })
      .flatMap((event) => expandRepeatingEvent(event));
  });

  function eventStartMs(event) {
    const date = event.value.date || "";
    const time = event.value.time || "00:00";
    const parsed = new Date(`${date}T${time}`).getTime();

    return Number.isNaN(parsed) ? event.value.published : parsed;
  }

  const sortedEventObjects = computed(() => {
    return [...visibleEventObjects.value].sort((a, b) => {
      return eventStartMs(a) - eventStartMs(b);
    });
  });

  const myLatestRsvpByEvent = computed(() => {
    const latest = new Map();

    if (!activeActor.value) return latest;

    const myRsvps = allRsvpObjects.value
      .filter((rsvp) => {
        return (
          rsvp.actor === activeActor.value &&
          rsvp.value.target === activeChatChannel.value
        );
      })
      .sort((a, b) => {
        return a.value.published - b.value.published;
      });

    for (const rsvp of myRsvps) {
      latest.set(rsvp.value.object, rsvp);
    }

    return latest;
  });

  const myRsvpEventUrls = computed(() => {
    const urls = new Set();

    for (const [eventUrl, rsvp] of myLatestRsvpByEvent.value.entries()) {
      if (rsvp.value.response === "yes") {
        urls.add(eventUrl);
      }
    }

    return urls;
  });

  const myRsvpedEvents = computed(() => {
    return sortedEventObjects.value.filter((event) => {
      return myRsvpEventUrls.value.has(event.url);
    });
  });

  const rsvpedEventCount = computed(() => {
    return myRsvpedEvents.value.length;
  });

  const calendarMonthDate = computed(() => {
    const firstRsvpedEvent = myRsvpedEvents.value[0];

    if (firstRsvpedEvent?.value?.date) {
      const parsed = new Date(`${firstRsvpedEvent.value.date}T00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return new Date();
  });

  const calendarMonthLabel = computed(() => {
    return calendarMonthDate.value
      .toLocaleString([], { month: "short" })
      .toUpperCase();
  });

  const calendarYearLabel = computed(() => {
    return calendarMonthDate.value.getFullYear();
  });

  const calendarDays = computed(() => {
    const year = calendarMonthDate.value.getFullYear();
    const month = calendarMonthDate.value.getMonth();

    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startingWeekday = firstDay.getDay();

    const rsvpedDayNumbers = new Set();

    for (const event of myRsvpedEvents.value) {
      const parsed = new Date(`${event.value.date}T00:00`);

      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getFullYear() === year &&
        parsed.getMonth() === month
      ) {
        rsvpedDayNumbers.add(parsed.getDate());
      }
    }

    const days = [];

    for (let i = 0; i < startingWeekday; i += 1) {
      days.push({
        key: `blank-${i}`,
        day: "",
        hasRsvp: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      days.push({
        key: `day-${day}`,
        day,
        hasRsvp: rsvpedDayNumbers.has(day),
      });
    }

    return days;
  });

  const activeChat = computed(() => {
    if (!canShowUserData.value) return null;

    const chat = allChatObjects.value.find((chat) => {
      return chat.value.channel === activeChatChannel.value;
    });

    if (!isChatMember(chat, activeActor.value)) return null;

    return chat;
  });

  const activeChatMembers = computed(() => {
    return getChatMembers(activeChat.value);
  });

  const statusChoices = [
    "😴",
    "😀",
    "😎",
    "🤓",
    "😭",
    "😡",
    "🥳",
    "🤒",
    "🍽️",
    "🏃",
    "📚",
    "💤",
  ];

  const allStatusObjects = computed(() => {
    return dedupeByUrl([...localStatusObjects.value, ...statusObjects.value]);
  });

  const latestStatusByActor = computed(() => {
    const latest = new Map();

    for (const status of allStatusObjects.value) {
      if (status.value.chatChannel !== activeChatChannel.value) continue;

      const existing = latest.get(status.actor);

      if (!existing || status.value.published > existing.value.published) {
        latest.set(status.actor, status);
      }
    }

    return latest;
  });

  const activeChatMemberStatuses = computed(() => {
    return activeChatMembers.value.map((member) => {
      const latestStatus = latestStatusByActor.value.get(member);

      return {
        actor: member,
        status: latestStatus?.value?.status || "😴",
        isOwn: member === activeActor.value,
      };
    });
  });

  const myCurrentStatus = computed(() => {
    if (!activeActor.value) return "😴";

    const latestStatus = latestStatusByActor.value.get(activeActor.value);

    return latestStatus?.value?.status || "😴";
  });

  const allDeletedChatObjects = computed(() => {
    return dedupeByUrl([
      ...localDeletedChatObjects.value,
      ...deletedChatObjects.value,
    ]);
  });

  const latestDeletedChatByChannel = computed(() => {
    const latest = new Map();

    for (const deletedChat of allDeletedChatObjects.value) {
      const channel = deletedChat.value.channel;
      const existing = latest.get(channel);

      if (!existing || deletedChat.value.published > existing.value.published) {
        latest.set(channel, deletedChat);
      }
    }

    return latest;
  });

  const {
    objects: memberProfileObjects,
    poll: pollMemberProfiles,
  } = useGraffitiDiscover(
    () => activeChatMembers.value,
    {
      properties: {
        value: {
          required: ["type", "describes", "name", "published"],
          properties: {
            type: { const: "Profile" },
            describes: { type: "string" },
            name: { type: "string" },
            icon: { type: "string" },
            iconIsMedia: { type: "boolean" },
            published: { type: "number" },
          },
        },
      },
    },
    () => session.value,
    false
  );

  const allMemberProfileObjects = computed(() => {
    return dedupeByUrl([
      ...localProfileObjects.value,
      ...memberProfileObjects.value,
    ]);
  });

  const latestProfileByActor = computed(() => {
    const latest = new Map();

    for (const profile of allMemberProfileObjects.value) {
      const actor = profile.value.describes;
      const existing = latest.get(actor);

      if (!existing || profile.value.published > existing.value.published) {
        latest.set(actor, profile);
      }
    }

    return latest;
  });

  const isAnyChatModalOpen = computed(() => {
    return (
      isCalendarOpen.value ||
      isRsvpEventsOpen.value ||
      isScheduleEventOpen.value ||
      isStatusesOpen.value ||
      isGroupDetailsOpen.value ||
      isPresetMenuOpen.value ||
      isMessageMediaPreviewOpen.value
    );
  });

  function getMemberProfile(actor) {
    return latestProfileByActor.value.get(actor) || null;
  }

  function getMemberProfilePhotoUrl(actor) {
    return (
      getMemberProfile(actor)?.value?.icon ||
      DEFAULT_PROFILE_PHOTO_URL
    );
  }

  function isMemberProfilePhotoMedia(actor) {
    const profile = getMemberProfile(actor);

    return Boolean(
      profile?.value?.icon &&
        profile?.value?.iconIsMedia
    );
  }

  async function newChat() {
    if (!(await requireLogin("Please log in before creating a chat."))) return;
    if (!newChatTitle.value.trim()) return;

    const creator = session.value.actor;
    const newChannel = crypto.randomUUID();
    const title = newChatTitle.value.trim();

    statusMessage.value = "Creating chat...";

    try {
      const createdChat = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title,
            channel: newChannel,
            members: [creator],
            // icon: DEFAULT_GROUP_PHOTO_URL,
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: [creator],
        },
        session.value
      );

      localChatObjects.value.push(createdChat);
      newChatTitle.value = "";
      statusMessage.value = "";

      await pollChats();

      navigateToPage("chat", newChannel);
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not create the chat. Try logging in again.";
    }
  }

  async function openChat(chat) {
    markChatRead(chat.value.channel);
    navigateToPage("chat", chat.value.channel);

    await pollMessages();
    await scrollChatToLatestMessage();
  }

  function closeChat() {
    markChatRead(activeChatChannel.value);
    goHome();
  }

  function toggleChatEditMode() {
    isEditingChats.value = !isEditingChats.value;
  }

  async function deleteChatFromHome(chat) {
    if (!(await requireLogin("Please log in before deleting a chat."))) {
      return;
    }

    if (!chat) return;

    const channel = chat.value.channel;
    const members = uniqueActors(getChatMembers(chat));

    isDeletingChat.value.add(channel);
    statusMessage.value = "Deleting chat...";

    try {
      const deletedChat = await graffiti.post(
        {
          value: {
            activity: "Delete",
            type: "Chat",
            channel,
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: members.length ? members : [session.value.actor],
        },
        session.value
      );

      localDeletedChatObjects.value.push(deletedChat);

      statusMessage.value = "";

      await pollDeletedChats();
      await pollChats();

      if (activeChatChannel.value === channel) {
        goHome();
      }
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not delete this chat.";
    } finally {
      isDeletingChat.value.delete(channel);
    }
  }

  function unreadCountForChat(chat) {
    if (!chat || !activeActor.value) return 0;

    const channel = chat.value.channel;
    const lastReadAt = getLastReadAt(channel);

    return allMessageObjects.value.filter((message) => {
      return (
        message.value.chatChannel === channel &&
        message.value.published > lastReadAt &&
        message.actor !== activeActor.value
      );
    }).length;
  }

  function displayUnreadCount(chat) {
    const count = unreadCountForChat(chat);

    if (count > 99) return "99+";

    return String(count);
  }

  function openSettings() {
    if (!session.value) {
      statusMessage.value = "Please log in before opening settings.";
      navigateToPage("login");
      return;
    }

    profileNameDraft.value = myProfile.value?.value?.name || "";
    profilePhotoDraft.value = myProfilePhotoUrl.value;
    profilePhotoIsMediaDraft.value = myProfilePhotoIsMedia.value;
    selectedProfilePhotoFile.value = null;
    statusMessage.value = "";

    isSettingsOpen.value = true;
  }

  function closeSettings() {
    isSettingsOpen.value = false;
    selectedProfilePhotoFile.value = null;
    profileNameDraft.value = myProfile.value?.value?.name || "";
    profilePhotoDraft.value = myProfilePhotoUrl.value;
    profilePhotoIsMediaDraft.value = myProfilePhotoIsMedia.value;
  }

  async function copyGraffitiUsername() {
    if (!myGraffitiUsername.value) return;

    try {
      await navigator.clipboard.writeText(myGraffitiUsername.value);
      statusMessage.value = "Graffiti username copied.";
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not copy username.";
    }
  }

  function handleProfilePhotoSelect(event) {
    const file = event.target.files?.[0] || null;
    selectedProfilePhotoFile.value = file;
  }

  async function saveProfileSettings() {
    if (!(await requireLogin("Please log in before editing your profile."))) {
      return;
    }

    const nextName = profileNameDraft.value.trim();

    if (!nextName) {
      statusMessage.value = "Please enter a username.";
      return;
    }

    statusMessage.value = "Saving profile...";

    try {
      let nextIcon = myProfile.value?.value?.icon || DEFAULT_PROFILE_PHOTO_URL;
      let nextIconIsMedia = Boolean(myProfile.value?.value?.iconIsMedia);

      if (selectedProfilePhotoFile.value) {
        const uploadedMedia = await graffiti.postMedia(
          {
            data: selectedProfilePhotoFile.value,
          },
          session.value
        );

        nextIcon =
          typeof uploadedMedia === "string"
            ? uploadedMedia
            : uploadedMedia?.url || uploadedMedia?.href || uploadedMedia?.dataUrl;

        if (!nextIcon) {
          throw new Error("No media URL returned from graffiti.postMedia.");
        }

        nextIconIsMedia = true;
      }

      const createdProfile = await graffiti.post(
        {
          channels: [session.value.actor],
          value: {
            type: "Profile",
            describes: session.value.actor,
            name: nextName,
            icon: nextIcon,
            iconIsMedia: nextIconIsMedia,
            published: Date.now(),
          },
        },
        session.value
      );

      localProfileObjects.value.push(createdProfile);

      profilePhotoDraft.value = nextIcon;
      profilePhotoIsMediaDraft.value = nextIconIsMedia;
      selectedProfilePhotoFile.value = null;
      statusMessage.value = "";

      await pollProfiles();
      await pollMemberProfiles();

    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not save your profile.";
    }
  }

  const isSending = ref(false);
  const whooshingMessageUrl = ref("");

  async function postChatMessage(content, loginMessage) {
    if (!(await requireLogin(loginMessage))) return false;
    if (!activeChat.value) return false;
    if (!content.trim()) return false;

    isSending.value = true;
    statusMessage.value = "";

    try {
      const createdMessage = await graffiti.post(
        {
          value: {
            activity: "Send",
            type: "Message",
            content: content.trim(),
            chatChannel: activeChat.value.value.channel,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: activeChatMembers.value,
        },
        session.value
      );

      localMessageObjects.value.push(createdMessage);

      whooshingMessageUrl.value = createdMessage.url;

      window.setTimeout(() => {
        if (whooshingMessageUrl.value === createdMessage.url) {
          whooshingMessageUrl.value = "";
        }
      }, 650);

      shouldStickToBottom.value = true;

      await pollMessages();
      await scrollToBottom({ force: true });

      return true;

    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not send the message. Try logging in again.";
      return false;
    } finally {
      isSending.value = false;
    }
  }

  async function sendMessage() {
    const content = myMessage.value.trim();
    if (!content) return;

    myMessage.value = "";

    const sent = await postChatMessage(
      content,
      "Please log in before sending a message."
    );

    if (!sent) {
      myMessage.value = content;
    }
  }

  function openMessageMediaPicker() {
    if (messageMediaInput.value) {
      messageMediaInput.value.value = "";
      messageMediaInput.value.click();
    }
  }

  function clearPendingMessageMedia() {
    if (pendingMessageMediaPreviewUrl.value) {
      URL.revokeObjectURL(pendingMessageMediaPreviewUrl.value);
    }

    pendingMessageMediaFile.value = null;
    pendingMessageMediaPreviewUrl.value = "";
    pendingMessageMediaType.value = "";
  }

  function cancelMessageMediaPreview() {
    isMessageMediaPreviewOpen.value = false;
    clearPendingMessageMedia();
  }

  async function confirmSendMessageMedia() {
    if (!pendingMessageMediaFile.value) {
      cancelMessageMediaPreview();
      return;
    }

    const file = pendingMessageMediaFile.value;

    isMessageMediaPreviewOpen.value = false;

    const sent = await sendMediaMessage(file);

    if (sent) {
      clearPendingMessageMedia();
    } else {
      pendingMessageMediaFile.value = file;
      pendingMessageMediaType.value = file.type;
      pendingMessageMediaPreviewUrl.value = URL.createObjectURL(file);
      isMessageMediaPreviewOpen.value = true;
    }
  }

  const pendingMessageMediaIsImage = computed(() => {
    return pendingMessageMediaType.value.startsWith("image/");
  });

  const pendingMessageMediaIsVideo = computed(() => {
    return pendingMessageMediaType.value.startsWith("video/");
  });

  function sendSelectedMessageMedia(event) {
    const file = event.target.files?.[0] || null;

    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      statusMessage.value = "Please choose an image or video file.";
      event.target.value = "";
      return;
    }

    const maxMediaBytes = 25 * 1024 * 1024;

    if (file.size > maxMediaBytes) {
      statusMessage.value = "Media must be 25MB or smaller.";
      event.target.value = "";
      return;
    }

    clearPendingMessageMedia();

    pendingMessageMediaFile.value = file;
    pendingMessageMediaType.value = file.type;
    pendingMessageMediaPreviewUrl.value = URL.createObjectURL(file);
    isMessageMediaPreviewOpen.value = true;
    statusMessage.value = "";

    event.target.value = "";
  }

  async function sendMediaMessage(file) {
    if (!(await requireLogin("Please log in before sending media."))) {
      return false;
    }

    if (!activeChat.value) return false;

    isSending.value = true;
    statusMessage.value = "Uploading media...";

    try {
      const uploadedMedia = await graffiti.postMedia(
        {
          data: file,
        },
        session.value
      );

      const mediaUrl =
        typeof uploadedMedia === "string"
          ? uploadedMedia
          : uploadedMedia?.url || uploadedMedia?.href || uploadedMedia?.dataUrl;

      if (!mediaUrl) {
        throw new Error("No media URL returned from graffiti.postMedia.");
      }

      const createdMessage = await graffiti.post(
        {
          value: {
            activity: "Send",
            type: "Message",
            content: myMessage.value.trim(),
            chatChannel: activeChat.value.value.channel,
            mediaUrl,
            mediaType: file.type,
            mediaName: file.name,
            mediaSize: file.size,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: activeChatMembers.value,
        },
        session.value
      );

      localMessageObjects.value.push(createdMessage);

      myMessage.value = "";
      statusMessage.value = "";
      whooshingMessageUrl.value = createdMessage.url;

      window.setTimeout(() => {
        if (whooshingMessageUrl.value === createdMessage.url) {
          whooshingMessageUrl.value = "";
        }
      }, 650);

      shouldStickToBottom.value = true;

      await pollMessages();
      await scrollToBottom({ force: true });

      return true;
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not send the media.";
      return false;
    } finally {
      isSending.value = false;
    }
  }

  async function sendPreset(preset) {
    if (!preset) return;

    const content = `${preset.emoji} ${preset.message}`.trim();

    const sent = await postChatMessage(
      content,
      "Please log in before sending a preset."
    );

    if (sent) {
      closePresetMenu();
    }
  }

  function getPresetStorageKey() {
    const actor = session.value?.actor || "guest";
    return `muddy-chat-presets:${actor}`;
  }

  function loadPresets() {
    try {
      const rawPresets = localStorage.getItem(getPresetStorageKey());

      if (!rawPresets) {
        presets.value = [];
        return;
      }

      const parsedPresets = JSON.parse(rawPresets);

      presets.value = Array.isArray(parsedPresets)
        ? parsedPresets.filter((preset) => {
            return preset && preset.id && preset.emoji && preset.message;
          })
        : [];
    } catch (error) {
      console.error(error);
      presets.value = [];
    }
  }

  function savePresetsToStorage() {
    localStorage.setItem(getPresetStorageKey(), JSON.stringify(presets.value));
  }

  function togglePresetMenu() {
    isPresetMenuOpen.value = !isPresetMenuOpen.value;

    if (!isPresetMenuOpen.value) {
      closePresetEditor();
      isEditingPresets.value = false;
    }
  }

  function closePresetMenu() {
    isPresetMenuOpen.value = false;
    isEditingPresets.value = false;
    closePresetEditor();
  }

  function togglePresetEditMode() {
    isEditingPresets.value = !isEditingPresets.value;
  }

  function openNewPresetEditor() {
    editingPresetIndex.value = null;
    presetEmoji.value = "";
    presetMessage.value = "";
    statusMessage.value = "";
    isPresetEditorOpen.value = true;
  }

  function openPresetEditor(index) {
    const preset = presets.value[index];
    if (!preset) return;

    editingPresetIndex.value = index;
    presetEmoji.value = preset.emoji;
    presetMessage.value = preset.message;
    statusMessage.value = "";
    isPresetEditorOpen.value = true;
  }

  function closePresetEditor() {
    isPresetEditorOpen.value = false;
    editingPresetIndex.value = null;
    presetEmoji.value = "";
    presetMessage.value = "";
  }

  function savePreset() {
    const emoji = presetEmoji.value.trim();
    const message = presetMessage.value.trim();

    if (!emoji || !message) {
      statusMessage.value = "Please enter both an emoji and a preset message.";
      return;
    }

    const existingPreset =
      editingPresetIndex.value === null
        ? null
        : presets.value[editingPresetIndex.value];

    const savedPreset = {
      id: existingPreset?.id || crypto.randomUUID(),
      emoji,
      message,
    };

    if (editingPresetIndex.value === null) {
      presets.value = [...presets.value, savedPreset];
    } else {
      presets.value = presets.value.map((preset, index) => {
        return index === editingPresetIndex.value ? savedPreset : preset;
      });
    }

    savePresetsToStorage();
    statusMessage.value = "";
    closePresetEditor();
  }

  function deletePreset() {
    if (editingPresetIndex.value === null) return;

    presets.value = presets.value.filter((_, index) => {
      return index !== editingPresetIndex.value;
    });

    savePresetsToStorage();
    statusMessage.value = "";
    closePresetEditor();
  }

  function openGroupDetails() {
    if (!activeChat.value) return;

    groupChatTitleDraft.value = activeChat.value.value.title || "";
    groupChatPhotoDraft.value = getChatPhotoUrl(activeChat.value);
    groupChatPhotoIsMediaDraft.value = isGroupPhotoMedia(activeChat.value);
    selectedGroupPhotoFile.value = null;
    actorToAdd.value = "";
    statusMessage.value = "";

    isGroupDetailsOpen.value = true;
    isCalendarOpen.value = false;
    isRsvpEventsOpen.value = false;
    isScheduleEventOpen.value = false;
    isStatusesOpen.value = false;
    isPresetMenuOpen.value = false;

    pollMemberProfiles();
  }

  function closeGroupDetails() {
    isGroupDetailsOpen.value = false;
    actorToAdd.value = "";
    selectedGroupPhotoFile.value = null;
    groupChatTitleDraft.value = activeChat.value?.value?.title || "";
    groupChatPhotoDraft.value = getChatPhotoUrl(activeChat.value);
    groupChatPhotoIsMediaDraft.value = isGroupPhotoMedia(activeChat.value);
  }

  async function leaveGroupChat() {
    if (!(await requireLogin("Please log in before leaving this chat."))) {
      return;
    }

    if (!activeChat.value || !activeActor.value) return;

    const currentMembers = uniqueActors(activeChatMembers.value);
    const remainingMembers = currentMembers.filter((member) => {
      return member !== activeActor.value;
    });

    if (remainingMembers.length === currentMembers.length) {
      statusMessage.value = "You are not a member of this chat.";
      return;
    }

    isLeavingChat.value = true;
    statusMessage.value = "Leaving group chat...";

    try {
      const now = Date.now();

      const updatedChat = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title: activeChat.value.value.title,
            channel: activeChat.value.value.channel,
            members: remainingMembers,
            icon: activeChat.value.value.icon,
            iconIsMedia: Boolean(activeChat.value.value.iconIsMedia),
            photoUrl: activeChat.value.value.photoUrl,
            published: now,
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: currentMembers,
        },
        session.value
      );

      const removedMember = await graffiti.post(
        {
          value: {
            activity: "Remove",
            type: "Member",
            object: activeActor.value,
            target: activeChat.value.value.channel,
            published: now + 1,
          },
          channels: [
            CHAT_DIRECTORY_CHANNEL,
            activeChat.value.value.channel,
          ],
          allowed: currentMembers,
        },
        session.value
      );

      localChatObjects.value.push(updatedChat);
      localAddObjects.value.push(removedMember);

      isGroupDetailsOpen.value = false;
      statusMessage.value = "";

      await pollChats();
      await pollDirectoryAdds();
      await pollAdds();
      await pollDeletedChats();
      await pollHomepageMessages();

      goHome();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not leave this chat.";
    } finally {
      isLeavingChat.value = false;
    }
  }

  async function renameGroupChat() {
    if (!(await requireLogin("Please log in before changing the group name."))) {
      return;
    }

    if (!activeChat.value) return;

    const nextTitle = groupChatTitleDraft.value.trim();

    if (!nextTitle) {
      statusMessage.value = "Please enter a group name.";
      return;
    }

    const allowedActors = uniqueActors(activeChatMembers.value);

    statusMessage.value = "Updating group name...";

    try {
      const updatedChat = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title: nextTitle,
            channel: activeChat.value.value.channel,
            members: allowedActors,
            icon: activeChat.value.value.icon,
            iconIsMedia: Boolean(activeChat.value.value.iconIsMedia),
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: allowedActors,
        },
        session.value
      );

      localChatObjects.value.push(updatedChat);
      groupChatTitleDraft.value = nextTitle;
      statusMessage.value = "";

      await pollChats();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not update the group name.";
    }
  }

  async function updateGroupChatPhoto() {
    if (!(await requireLogin("Please log in before changing the group photo."))) {
      return;
    }

    if (!activeChat.value) return;

    if (!selectedGroupPhotoFile.value) {
      statusMessage.value = "Please choose an image first.";
      return;
    }

    statusMessage.value = "Uploading group photo...";

    try {
      const uploadedMedia = await graffiti.postMedia(
        {
          data: selectedGroupPhotoFile.value,
        },
        session.value
      );

      const pictureUrl =
        typeof uploadedMedia === "string"
          ? uploadedMedia
          : uploadedMedia?.url || uploadedMedia?.href || uploadedMedia?.dataUrl;

      if (!pictureUrl) {
        throw new Error("No media URL returned from graffiti.postMedia.");
      }

      const allowedActors = uniqueActors(activeChatMembers.value);

      const updatedChat = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title: activeChat.value.value.title,
            channel: activeChat.value.value.channel,
            members: allowedActors,
            icon: pictureUrl,
            iconIsMedia: true,
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: allowedActors,
        },
        session.value
      );

      localChatObjects.value.push(updatedChat);
      groupChatPhotoDraft.value = pictureUrl;
      groupChatPhotoIsMediaDraft.value = true;
      selectedGroupPhotoFile.value = null;
      statusMessage.value = "";

      await pollChats();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not update the group photo.";
    }
  }

  async function addToChat() {
    if (!(await requireLogin("Please log in before adding someone to a chat.")))
      return;

    if (!activeChat.value) return;
    if (!actorToAdd.value.trim()) return;

    const rawPersonToAdd = actorToAdd.value.trim();

    statusMessage.value = "Adding person...";

    try {
      const personToAdd = rawPersonToAdd.startsWith("did:")
        ? rawPersonToAdd
        : await graffiti.handleToActor(rawPersonToAdd);

      if (!personToAdd) {
        throw new Error("No actor found for that username");
      }

      const allowedActors = uniqueActors([
        ...activeChatMembers.value,
        personToAdd,
      ]);

      const createdAdd = await graffiti.post(
        {
          value: {
            activity: "Add",
            type: "Member",
            object: personToAdd,
            target: activeChat.value.value.channel,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel, CHAT_DIRECTORY_CHANNEL],
          allowed: allowedActors,
        },
        session.value
      );

      const sharedChatRecord = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Chat",
            title: activeChat.value.value.title,
            channel: activeChat.value.value.channel,
            members: allowedActors,
            icon: activeChat.value.value.icon,
            iconIsMedia: Boolean(activeChat.value.value.iconIsMedia),
            published: Date.now(),
          },
          channels: [CHAT_DIRECTORY_CHANNEL],
          allowed: allowedActors,
        },
        session.value
      );

      localAddObjects.value.push(createdAdd);
      localChatObjects.value.push(sharedChatRecord);
      actorToAdd.value = "";
      statusMessage.value = "";

      await pollAdds();
      await pollDirectoryAdds();
    } catch (error) {
      console.error(error);
      statusMessage.value =
        "Could not add that person. Check the username and try again.";
    }
  }

  function openCalendar() {
    isGroupDetailsOpen.value = false;
    isCalendarOpen.value = true;
    isRsvpEventsOpen.value = false;
    isScheduleEventOpen.value = false;
  }

  function closeCalendar() {
    isCalendarOpen.value = false;
    isRsvpEventsOpen.value = false;
    isScheduleEventOpen.value = false;
  }

  function openRsvpEvents() {
    isRsvpEventsOpen.value = true;
    isCalendarOpen.value = false;
    isScheduleEventOpen.value = false;
  }

  function closeRsvpEvents() {
    isRsvpEventsOpen.value = false;
    isCalendarOpen.value = true;
  }

  function openNativePicker(event) {
    const control = event.currentTarget;

    if (control && typeof control.showPicker === "function") {
      control.showPicker();
    }
  }

  function openScheduleEvent() {
    eventTitle.value = "";
    eventDate.value = "";
    eventTime.value = "";
    eventVisibility.value = "chat";
    eventRepeat.value = "none";
    eventRepeatUntil.value = "";

    isScheduleEventOpen.value = true;
    isCalendarOpen.value = false;
    isRsvpEventsOpen.value = false;
  }

  function cancelScheduleEvent() {
    isScheduleEventOpen.value = false;
    isCalendarOpen.value = true;
  }

  function formatEventDate(event) {
    const date = event.value.date;

    if (!date) return "";

    const [year, month, day] = date.split("-");

    if (!month || !day) return date;

    return `${month}/${day}`;
  }

  function formatEventTime(event) {
    const time = event.value.time;

    if (!time) return "";

    const [hourText, minute] = time.split(":");
    let hour = Number(hourText);

    if (Number.isNaN(hour)) return time;

    const suffix = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;

    return `${hour}:${minute} ${suffix}`;
  }

  function isRsvped(event) {
    return myRsvpEventUrls.value.has(event.url);
  }

  async function scheduleEvent() {
    if (!(await requireLogin("Please log in before scheduling an event."))) return;
    if (!activeChat.value) return;

    const title = eventTitle.value.trim();
    const date = eventDate.value;
    const time = eventTime.value;
    const repeat = eventRepeat.value;
    const repeatUntil = eventRepeatUntil.value;

    if (!title || !date || !time) {
      statusMessage.value = "Please enter a title, date, and time.";
      return;
    }

    if (repeat !== "none" && !repeatUntil) {
      statusMessage.value = "Please choose when the repeating event ends.";
      return;
    }

    if (repeat !== "none" && repeatUntil < date) {
      statusMessage.value = "Repeat until date must be after the event date.";
      return;
    }

    const allowedActors =
      eventVisibility.value === "private"
        ? [activeActor.value]
        : activeChatMembers.value;

    statusMessage.value = "Scheduling event...";

    try {
      const createdEvent = await graffiti.post(
        {
          value: {
            activity: "Create",
            type: "Event",
            title,
            date,
            time,
            visibility: eventVisibility.value,
            chatChannel: activeChat.value.value.channel,
            repeat,
            repeatUntil: repeat === "none" ? "" : repeatUntil,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: allowedActors,
        },
        session.value
      );

      localEventObjects.value.push(createdEvent);

      eventTitle.value = "";
      eventDate.value = "";
      eventTime.value = "";
      eventVisibility.value = "chat";
      eventRepeat.value = "none";
      eventRepeatUntil.value = "";

      statusMessage.value = "";

      await pollEvents();

      isScheduleEventOpen.value = false;
      isCalendarOpen.value = true;
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not schedule this event.";
    }
  }

  async function rsvpToEvent(event) {
    if (!(await requireLogin("Please log in before RSVPing."))) return;
    if (!activeChat.value) return;
    if (isRsvped(event)) return;

    statusMessage.value = "Saving RSVP...";

    try {
      const createdRsvp = await graffiti.post(
        {
          value: {
            activity: "RSVP",
            type: "EventRSVP",
            object: event.url,
            target: activeChat.value.value.channel,
            response: "yes",
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: activeChatMembers.value,
        },
        session.value
      );

      localRsvpObjects.value.push(createdRsvp);

      statusMessage.value = "";

      await pollRsvps();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not RSVP to this event.";
    }
  }

  async function unRsvpFromEvent(event) {
    if (!(await requireLogin("Please log in before changing your RSVP."))) return;
    if (!activeChat.value) return;
    if (!isRsvped(event)) return;

    statusMessage.value = "Removing RSVP...";

    try {
      const createdRsvp = await graffiti.post(
        {
          value: {
            activity: "RSVP",
            type: "EventRSVP",
            object: event.url,
            target: activeChat.value.value.channel,
            response: "no",
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: activeChatMembers.value,
        },
        session.value
      );

      localRsvpObjects.value.push(createdRsvp);

      statusMessage.value = "";

      await pollRsvps();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not remove your RSVP.";
    }
  }

  function openStatuses() {
    isGroupDetailsOpen.value = false;
    selectedStatusEmoji.value = myCurrentStatus.value || "😴";
    customStatusEmoji.value = "";
    isStatusesOpen.value = true;
  }

  function closeStatuses() {
    isStatusesOpen.value = false;
    selectedStatusEmoji.value = "😴";
    customStatusEmoji.value = "";
  }

  async function updateMyStatus(statusOverride = null) {
    if (!(await requireLogin("Please log in before updating your status."))) return;
    if (!activeChat.value) return;

    const status = (
      statusOverride ||
      customStatusEmoji.value.trim() ||
      selectedStatusEmoji.value ||
      "😴"
    ).trim();

    if (!status) {
      statusMessage.value = "Choose or enter a status first.";
      return;
    }

    statusMessage.value = "Updating status...";

    try {
      const createdStatus = await graffiti.post(
        {
          value: {
            activity: "Set",
            type: "Status",
            status,
            chatChannel: activeChat.value.value.channel,
            published: Date.now(),
          },
          channels: [activeChat.value.value.channel],
          allowed: activeChatMembers.value,
        },
        session.value
      );

      localStatusObjects.value.push(createdStatus);

      selectedStatusEmoji.value = status;
      customStatusEmoji.value = "";
      statusMessage.value = "";

      await pollStatuses();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not update your status.";
    }
  }

  function isOwnMessage(message) {
    return message.actor === activeActor.value;
  }

  const shouldStickToBottom = ref(true);
  let scrollFrameOne = 0;
  let scrollFrameTwo = 0;

  function getMessagesScroller() {
    return messagesEl.value;
  }

  function isNearBottom(scroller, threshold = 90) {
    return (
      scroller.scrollHeight -
        scroller.scrollTop -
        scroller.clientHeight <=
      threshold
    );
  }

  function updateMessageStickiness() {
    const scroller = getMessagesScroller();

    if (!scroller) {
      shouldStickToBottom.value = true;
      return;
    }

    shouldStickToBottom.value = isNearBottom(scroller);
  }

  async function scrollToBottom({ force = false } = {}) {
    await nextTick();

    cancelAnimationFrame(scrollFrameOne);
    cancelAnimationFrame(scrollFrameTwo);

    scrollFrameOne = requestAnimationFrame(() => {
      scrollFrameTwo = requestAnimationFrame(() => {
        const scroller = getMessagesScroller();

        if (!scroller) return;

        if (force || shouldStickToBottom.value || isNearBottom(scroller)) {
          scroller.scrollTop = scroller.scrollHeight;
        }
      });
    });
  }

  async function scrollChatToLatestMessage() {
    await nextTick();

    if (!messagesEl.value) return;

    messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }

  const isDeleting = ref(new Set());

  async function deleteMessage(message) {
    if (!(await requireLogin("Please log in before deleting a message.")))
      return;

    isDeleting.value.add(message.url);

    try {
      await graffiti.delete(message, session.value);

      localMessageObjects.value = localMessageObjects.value.filter((object) => {
        return object.url !== message.url;
      });

      await pollMessages();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Could not delete this message.";
    } finally {
      isDeleting.value.delete(message.url);
    }
  }

  watch(
    () => sortedMessageObjects.value.length,
    async (newLength, oldLength) => {
      if (!activeChatChannel.value) return;
      if (newLength <= oldLength) return;

      await scrollToBottom({ force: false });
    }
  );
  
  watch(
    () => sortedMessageObjects.value.length,
    async (newLength, oldLength) => {
      if (!activeChatChannel.value) return;
      if (newLength <= oldLength) return;

      await scrollToBottom({ force: false });
    }
  );

  watch(activeChatChannel, async () => {
    clearChatInputs();
    statusMessage.value = "";

    shouldStickToBottom.value = true;

    if (activeChatChannel.value) {
      await pollMessages();
      await pollAdds();
      await pollRsvps();
      await pollEvents();
      await pollStatuses();

      await scrollChatToLatestMessage();
    }

    await scrollToBottom({ force: true });
  });

  watch(session, async (newSession) => {
    if (shouldRedirectHomeAfterLogin.value && newSession) {
      shouldRedirectHomeAfterLogin.value = false;
      navigateToPage("home");
    } else {
      readRouteFromUrl();
    }

    loadPresets();
    statusMessage.value = "";

    localChatObjects.value = [];
    localMessageObjects.value = [];
    localAddObjects.value = [];
    localEventObjects.value = [];
    localRsvpObjects.value = [];
    localStatusObjects.value = [];
    localProfileObjects.value = [];
    localDeletedChatObjects.value = [];

    await pollChats();
    await pollDirectoryAdds();
    await pollProfiles();
    await pollDeletedChats();
    await pollHomepageMessages();

    if (activeChatChannel.value) {
      shouldStickToBottom.value = true;

      await pollMessages();
      await pollAdds();
      await pollEvents();
      await pollRsvps();
      await pollStatuses();

      await scrollToBottom({ force: true });
    }
  });

  onMounted(async () => {
    readRouteFromUrl();
    loadPresets();

    const redirectingToFinishLogin = await maybeFinishLoginFromUsername();
    if (redirectingToFinishLogin) return;

    await pollChats();
    await pollDirectoryAdds();
    await pollDeletedChats();
    await pollHomepageMessages();

    if (activeChatChannel.value) {
      shouldStickToBottom.value = true;

      await pollMessages();
      await pollAdds();
      await pollEvents();
      await pollRsvps();
      await pollStatuses();

      await scrollToBottom({ force: true });
    }
  });

  return {
    session,
    isLoggedIn,
    activeActor,
    urlUsername,
    isFinishingLogin,

    currentPath,
    currentRoute,
    messagesEl,

    newChatTitle,
    myMessage,
    messageMediaInput,
    actorToAdd,
    statusMessage,
    activeChatChannel,
    pendingMessageMediaFile,
    pendingMessageMediaPreviewUrl,
    pendingMessageMediaType,
    isMessageMediaPreviewOpen,
    pendingMessageMediaIsImage,
    pendingMessageMediaIsVideo,

    chatObjects: allChatObjects,
    sortedChats,
    areChatsLoading,
    messageObjects: visibleMessageObjects,
    sortedMessageObjects,
    areMessageObjectsLoading,
    activeChat,
    activeChatMembers,

    logIn,
    logOut,
    newChat,
    openChat,
    closeChat,
    goHome,
    goLogin,
    sendMessage,
    addToChat,
    deleteMessage,
    isOwnMessage,
    updateMessageStickiness,
    openMessageMediaPicker,
    sendSelectedMessageMedia,
    sendMediaMessage,
    cancelMessageMediaPreview,
    confirmSendMessageMedia,

    isSending,
    whooshingMessageUrl,
    isDeleting,

    getPresetStorageKey,
    loadPresets,
    savePresetsToStorage,
    togglePresetMenu,
    closePresetMenu,
    togglePresetEditMode,
    openNewPresetEditor,
    openPresetEditor,
    closePresetEditor,
    savePreset,
    deletePreset,
    sendPreset,

    isPresetMenuOpen,
    isPresetEditorOpen,
    isEditingPresets,
    editingPresetIndex,
    presetEmoji,
    presetMessage,
    presets,

    isCalendarOpen,
    isRsvpEventsOpen,
    isScheduleEventOpen,

    eventTitle,
    eventDate,
    eventTime,
    eventVisibility,
    eventRepeat,
    eventRepeatUntil,

    sortedEventObjects,
    myRsvpedEvents,
    rsvpedEventCount,

    calendarMonthLabel,
    calendarYearLabel,
    calendarDays,

    openCalendar,
    closeCalendar,
    openRsvpEvents,
    closeRsvpEvents,
    openScheduleEvent,
    cancelScheduleEvent,
    scheduleEvent,
    rsvpToEvent,
    isRsvped,
    formatEventDate,
    formatEventTime,
    unRsvpFromEvent,

    isStatusesOpen,
    selectedStatusEmoji,
    customStatusEmoji,
    statusChoices,
    activeChatMemberStatuses,
    myCurrentStatus,

    openStatuses,
    closeStatuses,
    updateMyStatus,

    isGroupDetailsOpen,
    groupChatTitleDraft,
    groupChatPhotoDraft,
    groupChatPhotoIsMediaDraft,
    
    openGroupDetails,
    closeGroupDetails,
    renameGroupChat,

    DEFAULT_GROUP_PHOTO_URL,
    selectedGroupPhotoFile,
    shouldRedirectHomeAfterLogin,

    getChatPhotoUrl,
    isGroupPhotoMedia,
    handleGroupPhotoSelect,
    updateGroupChatPhoto,

    DEFAULT_PROFILE_PHOTO_URL,
    isSettingsOpen,
    profileNameDraft,
    profilePhotoDraft,
    profilePhotoIsMediaDraft,
    selectedProfilePhotoFile,

    myProfile,
    myDisplayName,
    myProfilePhotoUrl,
    myProfilePhotoIsMedia,

    openSettings,
    closeSettings,
    handleProfilePhotoSelect,
    saveProfileSettings,

    isEditingChats,
    isDeletingChat,
    isLeavingChat,

    toggleChatEditMode,
    deleteChatFromHome,
    leaveGroupChat,

    myGraffitiUsername,

    copyGraffitiUsername,

    getMemberProfile,
    getMemberProfilePhotoUrl,
    isMemberProfilePhotoMedia,

    pollMemberProfiles,
    isAnyChatModalOpen,

    openNativePicker,

    unreadCountForChat,
    displayUnreadCount,
    markChatRead,
  };
}

const ActorHandle = defineComponent({
  name: "ActorHandle",
  props: {
    actor: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const actorSession = useGraffitiSession();

    const { handle } = useGraffitiActorToHandle(() => props.actor);

    const {
      objects: actorProfileObjects,
    } = useGraffitiDiscover(
      () => (props.actor ? [props.actor] : []),
      {
        properties: {
          value: {
            required: ["type", "describes", "name", "published"],
            properties: {
              type: { const: "Profile" },
              describes: { type: "string" },
              name: { type: "string" },
              icon: { type: "string" },
              iconIsMedia: { type: "boolean" },
              published: { type: "number" },
            },
          },
        },
      },
      () => actorSession.value,
      false
    );

    function cleanHandle(value) {
      if (!value) return value;

      return value
        .replace(/\.graffiti\.actor$/i, "")
        .replace(/^@/, "");
    }

    const latestProfile = computed(() => {
      const profiles = actorProfileObjects.value
        .filter((profile) => {
          return profile.value.describes === props.actor;
        })
        .sort((a, b) => {
          return b.value.published - a.value.published;
        });

      return profiles[0] || null;
    });

    const displayName = computed(() => {
      if (latestProfile.value?.value?.name) {
        return latestProfile.value.value.name;
      }

      if (handle.value) return cleanHandle(handle.value);
      if (handle.value === undefined) return "Loading...";
      return cleanHandle(props.actor);
    });

    return {
      displayName,
    };
  },
  template: `<span>{{ displayName }}</span>`,
});

const MessageBubble = defineComponent({
  name: "MessageBubble",
  template: "#message-bubble-template",
  components: {
    ActorHandle,
  },
  props: {
    message: {
      type: Object,
      required: true,
    },
    own: {
      type: Boolean,
      default: false,
    },
    deleting: {
      type: Boolean,
      default: false,
    },
    whooshing: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["delete-message"],
  setup(props) {
    const formattedTime = computed(() => {
      const timestamp = props.message?.value?.published;
      if (!timestamp) return "";

      const date = new Date(timestamp);

      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
    });

    const isImageMessage = computed(() => {
      return props.message?.value?.mediaType?.startsWith("image/");
    });

    const isVideoMessage = computed(() => {
      return props.message?.value?.mediaType?.startsWith("video/");
    });

    return {
      formattedTime,
      isImageMessage,
      isVideoMessage,
    };
  },
});

const DEFAULT_GROUP_PHOTO_URL_FOR_CARD = "https://placehold.co/160x160?text=Group";

const ChatCard = defineComponent({
  name: "ChatCard",
  template: "#chat-card-template",
  props: {
    chat: {
      type: Object,
      required: true,
    },
    showImage: {
      type: Boolean,
      default: true,
    },
    editing: {
      type: Boolean,
      default: false,
    },
    deleting: {
      type: Boolean,
      default: false,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
  },
  emits: ["open-chat", "delete-chat"],
  setup(props) {
    const chatPhotoUrl = computed(() => {
      return (
        props.chat?.value?.icon ||
        props.chat?.value?.photoUrl ||
        DEFAULT_GROUP_PHOTO_URL_FOR_CARD
      );
    });

    const chatPhotoIsMedia = computed(() => {
      const icon = props.chat?.value?.icon || "";

      return Boolean(
        icon &&
          (
            props.chat?.value?.iconIsMedia ||
            (!icon.startsWith("http://") && !icon.startsWith("https://"))
          )
      );
    });

    return {
      chatPhotoUrl,
      chatPhotoIsMedia,
      DEFAULT_GROUP_PHOTO_URL_FOR_CARD,
    };
  },
});

const App = {
  template: "#template",
  components: {
    MessageBubble,
    ChatCard,
    ActorHandle,
    // GraffitiGetMedia,
  },
  setup,
};

createApp(App)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");