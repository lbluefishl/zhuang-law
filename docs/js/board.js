export const FONTS = {
  default: { label: 'Plain', family: 'inherit' },
  handwriting: { label: 'Handwriting', family: "'Caveat', cursive" },
  script: { label: 'Script', family: "'Pacifico', cursive" },
  rounded: { label: 'Rounded', family: "'Quicksand', sans-serif" },
};

export const COLORS = {
  yellow: '#fff3b0',
  pink: '#ffd6e8',
  blue: '#cfe8ff',
  green: '#d7f2d0',
  purple: '#e4d4f4',
  orange: '#ffe0c2',
};

export const BORDERS = ['none', 'solid', 'dashed', 'tape'];

export const DECORATIONS = ['', '🎉', '🎂', '✨', '🌸', '💛'];

export const MAX_MESSAGE_LENGTH = 1000;

export async function loadBoard(supabaseClient, slug) {
  const { data, error } = await supabaseClient.from('boards').select('*').eq('slug', slug).single();
  if (error) throw error;
  return data;
}

// Oldest first — a birthday-poster reads naturally as "everyone who left a
// note, in the order they left it," and it's what the collage lays out
// top-to-bottom/left-to-right in board.html.
export async function loadMessages(supabaseClient, boardId) {
  const { data, error } = await supabaseClient
    .from('board_messages')
    .select('id, body, font, note_color, border_style, decoration, user_id, created_at, profiles(display_name)')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertMyMessage(supabaseClient, { boardId, userId, existingId, body, font, noteColor, borderStyle, decoration }) {
  const row = {
    board_id: boardId,
    user_id: userId,
    body,
    font,
    note_color: noteColor,
    border_style: borderStyle,
    decoration: decoration || null,
    updated_at: new Date().toISOString(),
  };
  if (existingId) {
    const { error } = await supabaseClient.from('board_messages').update(row).eq('id', existingId);
    if (error) throw error;
  } else {
    const { error } = await supabaseClient.from('board_messages').insert(row);
    if (error) {
      // unique(board_id, user_id) race — e.g. submitted from two tabs at once.
      if (error.code === '23505') throw new Error('ALREADY_POSTED');
      throw error;
    }
  }
}

export async function deleteMyMessage(supabaseClient, id) {
  const { error } = await supabaseClient.from('board_messages').delete().eq('id', id);
  if (error) throw error;
}
