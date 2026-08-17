/**
 * The College's policy documents, as text the model can quote from.
 *
 * These are attached to a turn ONLY when the student's message looks like it is
 * about one of them. That matters for cost: together they are a few thousand tokens,
 * and the overwhelming majority of questions ("what is photosynthesis", "solve this")
 * have nothing to do with school policy. Gating on a local keyword match is free —
 * no model call, no tokens — so a normal turn pays nothing for this feature.
 *
 * Content is transcribed from the PDFs in docs/. Where a document is mostly images
 * (the uniform brochure), only what is genuinely legible is recorded, and the gaps
 * are stated as gaps rather than guessed at.
 */

export interface PolicySection {
  id: string;
  title: string;
  /** Lower-case terms that make this section relevant. */
  keywords: string[];
  text: string;
}

export const POLICY_SECTIONS: PolicySection[] = [
  {
    id: 'plagiarism',
    title: 'Plagiarism (Student Diary)',
    keywords: [
      'plagiar',
      'plagarism',
      'copy someone',
      'copied someone',
      'copying someone',
      'cheat',
      'cheating',
      'academic integrity',
      'academic honesty',
      'own work',
      'referencing',
      'reference properly',
      'citation',
      'cite properly',
      'caught using ai',
      'ai detector',
      'is it cheating',
    ],
    text: `Plagiarism — Your Work Must be Your Own!
Plagiarism is taking someone else's work or ideas and passing them off as one's own.
At Newman, plagiarism is considered a form of THEFT. All students are expected to
adhere to the highest standards of personal honesty and integrity in their work.

If a student is caught plagiarising, the consequences that may be applied are:
- a handwritten rewrite of the entire assessment
- loss of marks
- an equivalent alternative assessment
- suspension
- additional assessment or coursework focused on academic integrity
- any other consequence deemed reasonable by the College's Senior Leadership team.

(Policy developed by the Principal, approved by the Leadership Team 10/10/2021,
reviewed 19/11/2024.)`,
  },
  {
    id: 'behaviour-self',
    title: 'Code of Behaviour — treating yourself with respect',
    keywords: [
      'code of behaviour',
      'code of conduct',
      'behaviour policy',
      'self respect',
      'drugs',
      'alcohol',
      'smoking',
      'smoke',
      'tobacco',
      'vape',
      'vaping',
      'wellbeing',
      'in trouble',
      'get suspended',
      'suspension',
      'detention',
    ],
    text: `Code of Behaviour — Treating Ourselves with Respect
Each student is encouraged to maintain a healthy self-respect. No student may behave
in a manner that diminishes or endangers themselves. Achieved through:
- wearing correct uniform with pride
- using appropriate language and actions
- working to the best of your ability and accepting responsibility for your learning
- being concerned for your health and wellbeing, avoiding drugs, alcohol, tobacco and
  other illicit substances
- taking responsibility for your own actions and choices.`,
  },
  {
    id: 'behaviour-others',
    title: 'Code of Behaviour — treating others and the wider community with respect',
    keywords: [
      'bully',
      'bullying',
      'harass',
      'harassment',
      'discrimination',
      'racist',
      'fight',
      'fighting',
      'respect others',
      'treat others',
      'someone is being',
      'assembly',
      'liturgy',
      'reputation',
      'in public',
      'on the bus',
      'code of behaviour',
    ],
    text: `Code of Behaviour — Treating Others with Respect
Behaviour that diminishes or endangers fellow students, staff or community members is
unacceptable. Achieved through:
- showing courtesy and respecting the rights of others
- representing the College appropriately at all times, including in transit to and
  from the College and at community events
- keeping the environment free of discrimination and harassment
- abiding by the expectations of the College
- never acting in a way that may cause emotional or physical harm, and telling a
  staff member about any potential threat or danger to others' health and safety
- actively promoting the College values of Courage, Compassion, Humility, Truth and
  Wisdom
- making visitors, new staff and students feel welcome and supported
- engaging fully in assemblies and Liturgies — listening quietly, singing
  enthusiastically, clapping generously
- developing right relationships that show respect for each individual
- following reasonable and clearly communicated instructions.

Treating the Wider Community with Respect
Behaviour that compromises the health, safety or reputation of the College or the
wider community is unacceptable. Achieved through using appropriate language, working
in partnership with community groups and James Cook University, behaving well in the
public arena, and avoiding excessively boisterous, rude or reckless behaviour.`,
  },
  {
    id: 'behaviour-property',
    title: 'Code of Behaviour — property, environment and the learning process',
    keywords: [
      'property',
      'damage',
      'broke',
      'broken',
      'vandal',
      'graffiti',
      'litter',
      'rubbish',
      'environment',
      'classroom',
      'late to class',
      'being late',
      'disrupt',
      'homework policy',
      'set work',
      'code of behaviour',
    ],
    text: `Code of Behaviour — Treating all Property and the Environment with Respect
Achieved through respecting and caring for your own property; caring for equipment,
furniture and resources; reporting any damage; showing pride in and caring for the
school and university grounds and gardens; and keeping classrooms, buildings and
grounds tidy and clean.

Treating the Learning Process with Respect
No student may behave in a way that compromises learning and teaching. Achieved
through working towards learning goals, not compromising the educational rights of
others, supporting staff in maintaining good order, arriving to class prepared, on
time and ready to work, meeting all co-curricular commitments, and completing all set
work.

In return, staff commit to knowing their students and how they learn, expecting and
valuing an excellent standard of achievement, rewarding achievement, leading by
example, and giving ongoing feedback to students and families.`,
  },
  {
    id: 'devices',
    title: 'Devices and laptops',
    // Deliberately no bare "device"/"devices": an English student asking about
    // literary devices would otherwise get the electronics policy attached.
    keywords: [
      'laptop',
      'phone',
      'mobile phone',
      'iphone',
      'airpods',
      'earbuds',
      'headphones',
      'smart watch',
      'smartwatch',
      'apple watch',
      'ipad',
      'electronic device',
      'personal device',
      'locker',
      'my computer',
    ],
    text: `Devices
Every student is issued a College laptop, and that laptop is the device to use for
schoolwork. No other electronic device is permitted for use during the school day. A
student who brings a personal device — phone, tablet, watch, earbuds, console — must
keep it in their locker.

If a student asks whether some particular device is allowed, the answer follows from
that rule: use the College laptop, and anything else stays in the locker. For edge
cases, an exemption, or anything medical, point them at their teacher or the College
office rather than guessing.`,
  },
  {
    id: 'uniform',
    title: 'Uniform Guidelines',
    keywords: [
      'uniform',
      'wear',
      'wearing',
      'dress code',
      'shoes',
      'socks',
      'shirt',
      'blouse',
      'skirt',
      'skort',
      'shorts',
      'trousers',
      'hat',
      'bucket hat',
      'jewellery',
      'jewelry',
      'earring',
      'piercing',
      'nail polish',
      'makeup',
      'make up',
      'hair',
      'haircut',
      'dyed hair',
      'tie',
      'jumper',
      'jacket',
      'sports uniform',
      'pe uniform',
      'casual day',
      'free dress',
      'out of uniform',
      'name tag',
      'school bag',
      'backpack',
      'sunscreen',
    ],
    text: `College Uniform Guidelines — "An outward sign of success"
All students in Years 7-12 are required to wear the College uniform both at school and
while travelling to and from the College. The College's stated reasoning: the uniform
encourages pride in the College and in oneself, shows commitment to being part of the
Newman Catholic College community, lets students focus on their studies rather than
their appearance, eliminates competition in what students wear, and is the most
economical option.

The guidelines cover: junior uniforms (Years 7-10, two options) and senior uniforms
(Years 11-12, two options), each with shirt or blouse, shorts/trousers, skirt or
skort, shoes and socks; a reversible bucket hat and a formal hat; acceptable formal
shoes and unacceptable formal footwear; acceptable sports shoes; sports/PE uniform
(polo shirt, shorts, socks, optional jacket and track pant); house team uniforms;
swimming clothing for electives, camps and the swimming carnival; name tags; school
bag, backpack and duffle bag; winter wear; jewellery; hats and sun protection; hair
policy; ties; nail polish; make up; casual days; the out-of-uniform procedure; and
after-school or Saturday detentions.

The Principal reserves the right to decide matters of interpretation of what is
appropriate — including cultural considerations, grooming, hairstyles and casual
clothes.

IMPORTANT LIMIT: the brochure presents the actual garment specifics as photographs, so
the precise items, colours and permitted variations are NOT available to you. Explain
the general rule and the categories above, then send the student to the brochure
itself, their diary, or the uniform shop (ncc.uniformshop@cns.catholic.edu.au) for
specifics. Do not describe or invent particular garments, colours or measurements.`,
  },
];

/** How many sections may be attached to one turn, worst case. */
export const MAX_POLICY_SECTIONS = 2;

/**
 * Picks the policy sections relevant to a message, most relevant first.
 *
 * Pure string matching on purpose: it runs in the Worker, costs nothing, and adds no
 * latency, so a turn about photosynthesis pays nothing for the existence of the
 * policy corpus. Sections are capped because two are plenty of context and the whole
 * point is to keep the prompt small.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keywords must start on a word boundary.
 *
 * A plain substring test is badly wrong here: "What is photosynthesis?" contains
 * "hat", which matched the uniform policy and attached it to every third question.
 * The boundary is only required at the START so that stems still work — "plagiar"
 * needs to catch both "plagiarism" and "plagiarise".
 */
function matches(haystack: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}`).test(haystack);
}

export function findRelevantPolicies(message: string, limit = MAX_POLICY_SECTIONS): PolicySection[] {
  const haystack = message.toLowerCase();

  const scored = POLICY_SECTIONS.map((section) => {
    let score = 0;
    for (const keyword of section.keywords) {
      if (matches(haystack, keyword)) score += keyword.length;
    }
    return { section, score };
  }).filter((entry) => entry.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.section);
}

/** Renders the matched sections as a prompt block, or '' when nothing matched. */
export function buildPolicyContext(message: string): string {
  const sections = findRelevantPolicies(message);
  if (sections.length === 0) return '';

  return [
    'RELEVANT COLLEGE POLICY (attached because this message looks related to it)',
    'Answer from this text rather than from memory, and say which policy it comes from.',
    'If it does not actually cover what was asked, say so plainly instead of stretching it.',
    '',
    ...sections.map((section) => `--- ${section.title} ---\n${section.text}`),
  ].join('\n');
}
