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
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
  useGraffitiActorToHandle,
} from "@graffiti-garden/wrapper-vue";

function setup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const CHAT_DIRECTORY_CHANNEL = "group-chats-directory";

  const newChatTitle = ref("");
  const myMessage = ref("");
  const actorToAdd = ref("");
  const statusMessage = ref("");
  const messagesEl = ref(null);

  const isPresetMenuOpen = ref(false);
  const isPresetEditorOpen = ref(false);
  const isEditingPresets = ref(false);
  const editingPresetIndex = ref(null);

  const presetEmoji = ref("");
  const presetMessage = ref("");
  const presets = ref([]);

  const currentPath = ref("/home");
  const activeChatChannel = ref(null);

  const urlUsername = ref("");
  const isFinishingLogin = ref(false);

  const localChatObjects = ref([]);
  const localMessageObjects = ref([]);
  const localAddObjects = ref([]);

  const isCalendarOpen = ref(false);
  const isRsvpEventsOpen = ref(false);
  const isScheduleEventOpen = ref(false);

  const eventTitle = ref("");
  const eventDate = ref("");
  const eventTime = ref("");
  const eventVisibility = ref("chat");

  const localEventObjects = ref([]);
  const localRsvpObjects = ref([]);

  const isStatusesOpen = ref(false);
  const selectedStatusEmoji = ref("😴");
  const customStatusEmoji = ref("");

  const localStatusObjects = ref([]);

  function uniqueActors(actors) {
    return [...new Set((actors || []).filter(Boolean))];
  }

  function getChatMembers(chat) {
    if (!chat) return [];

    const members = new Set(chat.value.members || []);

    for (const addObj of allDirectoryAddObjects.value) {
      if (addObj.value.target === chat.value.channel) {
        members.add(addObj.value.object);
      }
    }

    return [...members];
  }

  function currentUserCanSeeChat(chat) {
    if (!activeActor.value) return false;
    return getChatMembers(chat).includes(activeActor.value);
  }

  function clearChatInputs() {
    myMessage.value = "";
    actorToAdd.value = "";
  }

  function readRouteFromUrl() {
    const url = new URL(window.location.href);

    urlUsername.value = url.searchParams.get("username") || "";

    const page = url.searchParams.get("page") || "home";
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

  const activeActor = computed(() => {
    return session.value?.actor || "";
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

    try {
      await graffiti.login();

      readRouteFromUrl();
      await maybeFinishLoginFromUsername();
    } catch (error) {
      console.error(error);
      statusMessage.value = "Login did not finish. Please try again.";
    }
  }

  async function logOut() {
    if (!session.value) return;

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
    readRouteFromUrl();

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
            activity: { const: "Add" },
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
            activity: { const: "Add" },
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

  function dedupeByUrl(objects) {
    const seen = new Set();

    return objects.filter((object) => {
      if (seen.has(object.url)) return false;
      seen.add(object.url);
      return true;
    });
  }

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
    return dedupeChatsByChannel([...localChatObjects.value, ...chatObjects.value]);
  });

  const allMessageObjects = computed(() => {
    return dedupeByUrl([...localMessageObjects.value, ...messageObjects.value]);
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

  const sortedMessageObjects = computed(() => {
    return [...visibleMessageObjects.value].sort((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  const allEventObjects = computed(() => {
    return dedupeByUrl([...localEventObjects.value, ...eventObjects.value]);
  });

  const allRsvpObjects = computed(() => {
    return dedupeByUrl([...localRsvpObjects.value, ...rsvpObjects.value]);
  });

  const visibleEventObjects = computed(() => {
    if (!canShowUserData.value) return [];
    if (!activeChat.value) return [];

    return allEventObjects.value.filter((event) => {
      return event.value.chatChannel === activeChatChannel.value;
    });
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

  function openChat(chat) {
    navigateToPage("chat", chat.value.channel);
  }

  function closeChat() {
    goHome();
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

  function openScheduleEvent() {
    eventTitle.value = "";
    eventDate.value = "";
    eventTime.value = "";
    eventVisibility.value = "chat";

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

    if (!title || !date || !time) {
      statusMessage.value = "Please enter a title, date, and time.";
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
    }

    await scrollToBottom({ force: true });
  });

  watch(session, async () => {
    readRouteFromUrl();
    loadPresets();
    statusMessage.value = "";

    localChatObjects.value = [];
    localMessageObjects.value = [];
    localAddObjects.value = [];
    localEventObjects.value = [];
    localRsvpObjects.value = [];
    localStatusObjects.value = [];

    await pollChats();
    await pollDirectoryAdds();

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
    actorToAdd,
    statusMessage,
    activeChatChannel,

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
    const { handle } = useGraffitiActorToHandle(() => props.actor);

    function cleanHandle(value) {
      if (!value) return value;

      return value
        .replace(/\.graffiti\.actor$/i, "")
        .replace(/^@/, "");
    }

    const displayName = computed(() => {
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

    return {
      formattedTime,
    };
  },
});

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
      default: false,
    },
  },
  emits: ["open-chat"],
});

const App = {
  template: "#template",
  components: {
    MessageBubble,
    ChatCard,
    ActorHandle,
  },
  setup,
};

createApp(App)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");