// UP Research Application - Local Storage Version
// Data will be stored in localStorage until connected to Supabase

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkAuthentication();
});

// Data Structure
const ROLES = {
    MEMBRO: {
        level: 1,
        name: 'Membro',
        color: '#6b8cae' // Azul claro derivado da logo
    },
    ESCRIBA: {
        level: 2,
        name: 'Escriba',
        color: '#4a6b8a' // Azul médio
    },
    REPRESENTANTE: {
        level: 3,
        name: 'Representante',
        color: '#2d4563' // Azul escuro intermediário
    },
    VETERANO: {
        level: 4,
        name: 'Veterano',
        color: '#1a2847' // Azul navy da logo
    },
    CHEFE: {
        level: 5,
        name: 'Chefe',
        color: '#a64d4d' // Vermelho bordô da logo
    },
    SENIOR: {
        level: 6,
        name: 'Senior',
        color: '#8b3838' // Vermelho escuro
    },
    FUNDADOR: {
        level: 7,
        name: 'Fundador',
        color: '#0f1829' // Azul quase preto
    }
};

const SPECIALTIES = {
    clinica: [
        'Cardiologia',
        'Endocrinologia',
        'Gastroenterologia',
        'Nefrologia',
        'Pneumologia',
        'Reumatologia',
        'Infectologia',
        'Hematologia',
        'Oncologia',
        'Neurologia',
        'Psiquiatria',
        'Geriatria',
        'Medicina de Família'
    ],
    cirurgia: [
        'Cirurgia Geral',
        'Cirurgia Cardiovascular',
        'Neurocirurgia',
        'Ortopedia',
        'Oftalmologia',
        'Otorrinolaringologia',
        'Urologia',
        'Cirurgia Plástica',
        'Cirurgia Torácica',
        'Cirurgia Vascular',
        'Ginecologia e Obstetrícia'
    ]
};

// Google Forms Links
const GOOGLE_FORMS = {
    whatsapp: 'https://forms.gle/example-whatsapp',
    duvidas: 'https://forms.gle/example-duvidas',
    relatorios: 'https://forms.gle/example-relatorios',
    promocao: 'https://forms.gle/example-promocao',
    denuncia: 'https://forms.gle/example-denuncia'
};

// Initialize app
function initializeApp() {
    // Initialize localStorage structures if they don't exist
    if (!localStorage.getItem('medicalSchools')) {
        localStorage.setItem('medicalSchools', JSON.stringify([
            'Universidade de São Paulo (USP)',
            'Universidade Federal do Rio de Janeiro (UFRJ)',
            'Universidade Federal de São Paulo (UNIFESP)',
            'Universidade Federal de Minas Gerais (UFMG)',
            'Universidade de Brasília (UnB)',
            'Universidade Estadual de Campinas (UNICAMP)',
            'Universidade Federal do Rio Grande do Sul (UFRGS)'
        ]));
    }

    if (!localStorage.getItem('users')) {
        // Create test users
        const testUsers = [
            {
                id: 'user_admin',
                name: 'Administrador',
                whatsapp: '+5511999999999',
                medicalSchool: 'Universidade de São Paulo (USP)',
                studentStatus: 'graduated',
                email: 'admin',
                password: 'admin',
                role: 'CHEFE',
                league: 'clinica',
                specialty: 'Cardiologia',
                deadlinesMissed: 0,
                research: ['research_1'],
                createdAt: new Date().toISOString()
            },
            {
                id: 'user_test1',
                name: 'João Silva',
                whatsapp: '+5511988888888',
                medicalSchool: 'Universidade de São Paulo (USP)',
                studentStatus: 'student',
                email: 'joao@test.com',
                password: 'test123',
                role: 'MEMBRO',
                league: 'clinica',
                specialty: 'Cardiologia',
                deadlinesMissed: 0,
                research: [],
                createdAt: new Date().toISOString()
            },
            {
                id: 'user_test2',
                name: 'Maria Santos',
                whatsapp: '+5511977777777',
                medicalSchool: 'Universidade Federal do Rio de Janeiro (UFRJ)',
                studentStatus: 'student',
                email: 'maria@test.com',
                password: 'test123',
                role: 'REPRESENTANTE',
                league: 'cirurgia',
                specialty: 'Cirurgia Geral',
                deadlinesMissed: 1,
                research: ['research_2'],
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('users', JSON.stringify(testUsers));
    }

    if (!localStorage.getItem('institutions')) {
        const testInstitutions = {
            'Universidade de São Paulo (USP)': {
                name: 'Universidade de São Paulo (USP)',
                whatsappGroup: 'https://chat.whatsapp.com/USP-UP-Research',
                approved: true,
                firstMember: 'user_admin',
                members: ['user_admin', 'user_test1'],
                createdAt: new Date().toISOString()
            },
            'Universidade Federal do Rio de Janeiro (UFRJ)': {
                name: 'Universidade Federal do Rio de Janeiro (UFRJ)',
                whatsappGroup: 'https://chat.whatsapp.com/UFRJ-UP-Research',
                approved: true,
                firstMember: 'user_test2',
                members: ['user_test2'],
                createdAt: new Date().toISOString()
            },
            'Universidade Federal de São Paulo (UNIFESP)': {
                name: 'Universidade Federal de São Paulo (UNIFESP)',
                whatsappGroup: 'https://chat.whatsapp.com/UNIFESP-UP-Research',
                approved: true,
                firstMember: 'user_admin',
                members: [],
                createdAt: new Date().toISOString()
            },
            'Universidade Federal de Minas Gerais (UFMG)': {
                name: 'Universidade Federal de Minas Gerais (UFMG)',
                whatsappGroup: 'https://chat.whatsapp.com/UFMG-UP-Research',
                approved: true,
                firstMember: 'user_admin',
                members: [],
                createdAt: new Date().toISOString()
            }
        };
        localStorage.setItem('institutions', JSON.stringify(testInstitutions));
    }

    if (!localStorage.getItem('research')) {
        const testResearch = [
            {
                id: 'research_1',
                title: 'Revisão Sistemática sobre Hipertensão Arterial em Jovens',
                league: 'clinica',
                specialty: 'Cardiologia',
                status: 'em_progresso',
                acceptingCoauthors: true,
                authorId: 'user_admin',
                authorName: 'Administrador',
                institution: 'Universidade de São Paulo (USP)',
                coauthors: ['user_test1'],
                startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString()
            },
            {
                id: 'research_2',
                title: 'Meta-Análise de Técnicas Cirúrgicas Minimamente Invasivas',
                league: 'cirurgia',
                specialty: 'Cirurgia Geral',
                status: 'em_progresso',
                acceptingCoauthors: false,
                authorId: 'user_test2',
                authorName: 'Maria Santos',
                institution: 'Universidade Federal do Rio de Janeiro (UFRJ)',
                coauthors: [],
                startDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date().toISOString()
            }
        ];
        localStorage.setItem('research', JSON.stringify(testResearch));
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Phone number inputs
    setupPhoneInput();

    // Medical school autocomplete
    const medicalSchoolInput = document.getElementById('medical-school-input');
    if (medicalSchoolInput) {
        medicalSchoolInput.addEventListener('input', handleMedicalSchoolInput);
        medicalSchoolInput.addEventListener('focus', handleMedicalSchoolInput);

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.dropdown-container')) {
                document.getElementById('dropdown-list').style.display = 'none';
            }
        });
    }
}

// Setup phone input validation
function setupPhoneInput() {
    const countryCode = document.getElementById('country-code');
    const phoneArea = document.getElementById('phone-area');
    const phoneFirst = document.getElementById('phone-first');
    const phoneSecond = document.getElementById('phone-second');
    const phonePreview = document.getElementById('phone-preview');
    const whatsappHidden = document.getElementById('whatsapp');

    if (!countryCode || !phoneArea || !phoneFirst || !phoneSecond) return;

    // Update placeholders based on country
    function updatePlaceholders() {
        const country = countryCode.value;

        // Clear previous values when switching countries
        phoneArea.value = '';
        phoneFirst.value = '';
        phoneSecond.value = '';

        if (country === '+55') {
            // Brazil format: (11) 99999-9999
            phoneArea.placeholder = 'DDD';
            phoneArea.maxLength = 2;
            phoneFirst.placeholder = '99999';
            phoneFirst.maxLength = 5;
            phoneSecond.placeholder = '9999';
            phoneSecond.maxLength = 4;
        } else if (country === '+1') {
            // USA/Canada format: (999) 999-9999
            phoneArea.placeholder = 'Area';
            phoneArea.maxLength = 3;
            phoneFirst.placeholder = '999';
            phoneFirst.maxLength = 3;
            phoneSecond.placeholder = '9999';
            phoneSecond.maxLength = 4;
        } else {
            // Generic international format
            phoneArea.placeholder = 'Código';
            phoneArea.maxLength = 4;
            phoneFirst.placeholder = 'Número';
            phoneFirst.maxLength = 8;
            phoneSecond.placeholder = '';
            phoneSecond.maxLength = 4;
            phoneSecond.style.display = 'none';
        }

        // Show/hide second field for international numbers
        if (country !== '+55' && country !== '+1') {
            phoneSecond.style.display = 'none';
            phoneSecond.required = false;
        } else {
            phoneSecond.style.display = 'block';
            phoneSecond.required = true;
        }

        updatePhonePreview();
    }

    // Only allow numbers
    function enforceNumericInput(e) {
        const input = e.target;
        input.value = input.value.replace(/\D/g, '');
    }

    // Auto-focus next field
    function autoFocusNext(e) {
        const input = e.target;
        const maxLength = parseInt(input.maxLength);

        if (input.value.length === maxLength) {
            if (input.id === 'phone-area') {
                phoneFirst.focus();
            } else if (input.id === 'phone-first') {
                phoneSecond.focus();
            }
        }

        updatePhonePreview();
    }

    // Update phone preview
    function updatePhonePreview() {
        const country = countryCode.value;
        const area = phoneArea.value;
        const first = phoneFirst.value;
        const second = phoneSecond.value;

        let formatted = '';
        let fullNumber = '';

        if (country === '+55') {
            // Brazil format: +55 (11) 99999-9999
            if (area || first || second) {
                formatted = country;
                if (area) formatted += ` (${area})`;
                if (first) formatted += ` ${first}`;
                if (second) formatted += `-${second}`;

                // Full number for WhatsApp (no formatting)
                if (area && first && second) {
                    fullNumber = `${country}${area}${first}${second}`;
                }
            }
        } else if (country === '+1') {
            // USA/Canada format: +1 (999) 999-9999
            if (area || first || second) {
                formatted = country;
                if (area) formatted += ` (${area})`;
                if (first) formatted += ` ${first}`;
                if (second) formatted += `-${second}`;

                // Full number for WhatsApp (no formatting)
                if (area && first && second) {
                    fullNumber = `${country}${area}${first}${second}`;
                }
            }
        } else {
            // Generic international format
            if (area || first) {
                formatted = country;
                if (area) formatted += ` ${area}`;
                if (first) formatted += ` ${first}`;

                // Full number for WhatsApp (no formatting)
                if (area && first) {
                    fullNumber = `${country}${area}${first}`;
                }
            }
        }

        phonePreview.textContent = formatted || 'Digite seu número';
        whatsappHidden.value = fullNumber;
    }

    // Validate complete phone number
    function validatePhoneNumber() {
        const country = countryCode.value;
        const area = phoneArea.value;
        const first = phoneFirst.value;
        const second = phoneSecond.value;

        if (country === '+55') {
            // Brazil validation
            if (area.length !== 2) {
                return 'DDD deve ter 2 dígitos';
            }
            if (first.length !== 5) {
                return 'Primeira parte deve ter 5 dígitos';
            }
            if (second.length !== 4) {
                return 'Segunda parte deve ter 4 dígitos';
            }
            // Validate DDD (Brazilian area codes 11-99)
            const ddd = parseInt(area);
            if (ddd < 11 || ddd > 99) {
                return 'DDD inválido (deve ser entre 11-99)';
            }
            // Validate mobile number (must start with 9)
            if (first[0] !== '9') {
                return 'Número de celular deve começar com 9';
            }
        } else if (country === '+1') {
            // USA/Canada validation
            if (area.length !== 3) {
                return 'Area code deve ter 3 dígitos';
            }
            if (first.length !== 3) {
                return 'Primeira parte deve ter 3 dígitos';
            }
            if (second.length !== 4) {
                return 'Segunda parte deve ter 4 dígitos';
            }
            // Validate area code (cannot start with 0 or 1)
            if (area[0] === '0' || area[0] === '1') {
                return 'Area code não pode começar com 0 ou 1';
            }
        } else {
            // Generic international validation
            if (!area || area.length < 1) {
                return 'Código de área é obrigatório';
            }
            if (!first || first.length < 4) {
                return 'Número deve ter pelo menos 4 dígitos';
            }
            // Total length check (area + first should be reasonable)
            const totalLength = area.length + first.length;
            if (totalLength < 6) {
                return 'Número muito curto para ser válido';
            }
            if (totalLength > 15) {
                return 'Número muito longo para ser válido';
            }
        }

        return null; // Valid
    }

    // Event listeners
    countryCode.addEventListener('change', updatePlaceholders);

    [phoneArea, phoneFirst, phoneSecond].forEach(input => {
        input.addEventListener('input', enforceNumericInput);
        input.addEventListener('input', autoFocusNext);
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedText = e.clipboardData.getData('text').replace(/\D/g, '');

            // Try to parse pasted number
            if (pastedText.length >= 10) {
                const country = countryCode.value;
                let offset = 0;

                // Remove country code if pasted
                if (pastedText.startsWith('55')) offset = 2;
                else if (pastedText.startsWith('1')) offset = 1;

                if (country === '+55') {
                    phoneArea.value = pastedText.substr(offset, 2);
                    phoneFirst.value = pastedText.substr(offset + 2, 5);
                    phoneSecond.value = pastedText.substr(offset + 7, 4);
                } else if (country === '+1') {
                    phoneArea.value = pastedText.substr(offset, 3);
                    phoneFirst.value = pastedText.substr(offset + 3, 3);
                    phoneSecond.value = pastedText.substr(offset + 6, 4);
                }

                updatePhonePreview();
            }
        });
    });

    // Backspace navigation
    [phoneFirst, phoneSecond].forEach((input, index) => {
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && input.value.length === 0) {
                if (input.id === 'phone-first') {
                    phoneArea.focus();
                } else if (input.id === 'phone-second') {
                    phoneFirst.focus();
                }
            }
        });
    });

    // Store validation function globally
    window.validatePhone = validatePhoneNumber;

    // Initialize
    updatePlaceholders();
}

// Handle login
function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const users = JSON.parse(localStorage.getItem('users'));
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        alert('E-mail ou senha incorretos!');
        return;
    }

    // Login successful
    localStorage.setItem('currentUser', JSON.stringify(user));
    redirectAfterLogin(user);
}

// Check if user is authenticated
function checkAuthentication() {
    const currentUser = localStorage.getItem('currentUser');
    const currentPage = getCurrentPage();

    if (currentUser && (currentPage === 'login-page' || currentPage === 'signup-page')) {
        const user = JSON.parse(currentUser);
        redirectAfterLogin(user);
    } else if (!currentUser && currentPage !== 'login-page' && currentPage !== 'signup-page') {
        showPage('login-page');
    } else if (currentUser) {
        const user = JSON.parse(currentUser);
        loadUserData(user);
    }
}

// Get current page
function getCurrentPage() {
    const pages = document.querySelectorAll('.page');
    for (let page of pages) {
        if (page.classList.contains('active')) {
            return page.id;
        }
    }
    return 'signup-page';
}

// Handle medical school input
function handleMedicalSchoolInput(e) {
    const input = e.target.value.toLowerCase();
    const dropdown = document.getElementById('dropdown-list');
    const schools = JSON.parse(localStorage.getItem('medicalSchools'));

    if (!input) {
        // Show all schools if input is empty
        displayDropdown(schools, dropdown);
        return;
    }

    // Filter schools
    const filtered = schools.filter(school =>
        school.toLowerCase().includes(input)
    );

    if (filtered.length === 0 && input.length > 3) {
        // Option to add new school
        dropdown.innerHTML = `
            <div class="dropdown-item add-new" onclick="addNewSchool('${e.target.value}')">
                <span>➕ Adicionar "${e.target.value}"</span>
            </div>
        `;
        dropdown.style.display = 'block';
    } else {
        displayDropdown(filtered, dropdown, input);
    }
}

// Display dropdown
function displayDropdown(schools, dropdown, highlight = '') {
    if (schools.length === 0) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.innerHTML = schools.map(school => {
        let displayText = school;
        if (highlight) {
            const regex = new RegExp(`(${highlight})`, 'gi');
            displayText = school.replace(regex, '<strong>$1</strong>');
        }
        return `<div class="dropdown-item" onclick="selectSchool('${school}')">${displayText}</div>`;
    }).join('');

    dropdown.style.display = 'block';
}

// Select school from dropdown
function selectSchool(school) {
    document.getElementById('medical-school-input').value = school;
    document.getElementById('dropdown-list').style.display = 'none';
}

// Add new school
function addNewSchool(schoolName) {
    const schools = JSON.parse(localStorage.getItem('medicalSchools'));

    // Validate format (should include abbreviation in parentheses)
    if (!schoolName.includes('(') || !schoolName.includes(')')) {
        alert('Por favor, adicione a abreviação entre parênteses. Exemplo: Universidade de São Paulo (USP)');
        return;
    }

    if (!schools.includes(schoolName)) {
        schools.push(schoolName);
        localStorage.setItem('medicalSchools', JSON.stringify(schools));
    }

    selectSchool(schoolName);
}

// Handle signup
function handleSignup(e) {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const whatsapp = document.getElementById('whatsapp').value;
    const medicalSchool = document.getElementById('medical-school-input').value;
    const studentStatus = document.getElementById('student-status').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Validate phone number
    const phoneError = window.validatePhone();
    if (phoneError) {
        alert('Erro no número de WhatsApp: ' + phoneError);
        return;
    }

    // Validate whatsapp is filled
    if (!whatsapp) {
        alert('Por favor, preencha o número de WhatsApp completo!');
        return;
    }

    // Validate
    if (password !== confirmPassword) {
        alert('As senhas não coincidem!');
        return;
    }

    // Check if medical school is valid
    const schools = JSON.parse(localStorage.getItem('medicalSchools'));
    if (!schools.includes(medicalSchool)) {
        alert('Por favor, selecione uma faculdade válida da lista ou adicione uma nova.');
        return;
    }

    // Check if email already exists
    const users = JSON.parse(localStorage.getItem('users'));
    if (users.find(u => u.email === email)) {
        alert('Este e-mail já está cadastrado!');
        return;
    }

    // Create user
    const user = {
        id: generateId(),
        name,
        whatsapp,
        medicalSchool,
        studentStatus,
        email,
        password, // In production, this should be hashed
        role: 'MEMBRO',
        league: null,
        specialty: null,
        deadlinesMissed: 0,
        research: [],
        createdAt: new Date().toISOString()
    };

    // Save user
    users.push(user);
    localStorage.setItem('users', JSON.stringify(users));

    // Check if first member of institution
    const institutions = JSON.parse(localStorage.getItem('institutions'));
    if (!institutions[medicalSchool]) {
        institutions[medicalSchool] = {
            name: medicalSchool,
            whatsappGroup: generateWhatsAppGroupLink(),
            approved: false,
            firstMember: user.id,
            members: [user.id],
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('institutions', JSON.stringify(institutions));

        // Login and show first member page
        localStorage.setItem('currentUser', JSON.stringify(user));
        showFirstMemberPage(user);
    } else {
        // Add to existing institution
        institutions[medicalSchool].members.push(user.id);
        localStorage.setItem('institutions', JSON.stringify(institutions));

        // Login and show home page
        localStorage.setItem('currentUser', JSON.stringify(user));
        redirectAfterLogin(user);
    }
}

// Generate unique ID
function generateId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Generate WhatsApp group link
function generateWhatsAppGroupLink() {
    const code = Math.random().toString(36).substr(2, 9).toUpperCase();
    return `https://chat.whatsapp.com/UPRESEARCH${code}`;
}

// Show first member page
function showFirstMemberPage(user) {
    document.getElementById('institution-name').textContent = user.medicalSchool;

    const institutions = JSON.parse(localStorage.getItem('institutions'));
    const institution = institutions[user.medicalSchool];

    document.getElementById('institution-whatsapp-link').value = institution.whatsappGroup;

    showPage('first-member-page');
}

// Redirect after login
function redirectAfterLogin(user) {
    const institutions = JSON.parse(localStorage.getItem('institutions'));
    const institution = institutions[user.medicalSchool];

    // Check if institution is approved
    if (!institution.approved && institution.firstMember === user.id) {
        showFirstMemberPage(user);
    } else if (!institution.approved) {
        alert('Sua instituição ainda está aguardando aprovação. O primeiro membro precisa completar o processo de divulgação.');
        logout();
    } else {
        loadUserData(user);
        showPage('home-page');
    }
}

// Load user data
function loadUserData(user) {
    // Update all user name displays
    document.getElementById('user-name').textContent = user.name.split(' ')[0];
    const networkName = document.getElementById('user-name-network');
    if (networkName) networkName.textContent = user.name.split(' ')[0];
    const researchName = document.getElementById('user-name-research');
    if (researchName) researchName.textContent = user.name.split(' ')[0];
    const profileName = document.getElementById('user-name-profile');
    if (profileName) profileName.textContent = user.name.split(' ')[0];

    // Profile header
    document.getElementById('profile-name').textContent = user.name;
    document.getElementById('profile-role').textContent = ROLES[user.role].name;
    document.getElementById('profile-institution').textContent = user.medicalSchool;

    // Avatar
    const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2);
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('user-avatar').style.backgroundColor = ROLES[user.role].color;

    // Stats
    document.getElementById('research-count').textContent = user.research.length;
    document.getElementById('deadline-count').textContent = user.deadlinesMissed;

    // Load research
    loadResearch(user);

    // Load members
    loadMembers(user);
}

// Load research
function loadResearch(user) {
    const research = JSON.parse(localStorage.getItem('research'));
    const institutionResearch = research.filter(r => r.institution === user.medicalSchool);

    const researchGrid = document.getElementById('research-grid');
    if (!researchGrid) return;

    if (institutionResearch.length === 0) {
        researchGrid.innerHTML = '<div class="empty-state">Nenhuma pesquisa encontrada. Seja o primeiro a criar!</div>';
        return;
    }

    researchGrid.innerHTML = institutionResearch.map(r => createResearchCard(r)).join('');

    // Populate specialty filter
    const specialtyFilter = document.getElementById('specialty-filter');
    if (specialtyFilter) {
        const specialties = new Set();
        institutionResearch.forEach(r => {
            if (r.specialty) specialties.add(r.specialty);
        });

        specialtyFilter.innerHTML = '<option value="">Todas especialidades</option>' +
            Array.from(specialties).map(s => `<option value="${s}">${s}</option>`).join('');
    }
}

// Create research card
function createResearchCard(research) {
    const statusColors = {
        em_progresso: '#10B981',
        finalizada: '#3B82F6',
        arquivada: '#6B7280'
    };

    const statusLabels = {
        em_progresso: 'Em Progresso',
        finalizada: 'Finalizada',
        arquivada: 'Arquivada'
    };

    const acceptingLabel = research.acceptingCoauthors ?
        '<span class="accepting-badge">✓ Aceitando coautores</span>' :
        '<span class="full-badge">Lotada</span>';

    return `
        <div class="research-card" onclick="viewResearch('${research.id}')">
            <div class="research-header">
                <div class="research-status" style="background: ${statusColors[research.status]}">
                    ${statusLabels[research.status]}
                </div>
                <div class="research-league">${research.league === 'clinica' ? 'Clínica' : 'Cirurgia'}</div>
            </div>
            <h4>${research.title}</h4>
            <p class="research-specialty">${research.specialty}</p>
            <p class="research-date">Iniciada em ${formatDate(research.startDate)}</p>
            <div class="research-footer">
                <div class="research-author">
                    <span>Por ${research.authorName}</span>
                </div>
                ${acceptingLabel}
            </div>
            <div class="research-coauthors">
                ${research.coauthors.length} coautor(es)
            </div>
        </div>
    `;
}

// Load members
function loadMembers(user) {
    const users = JSON.parse(localStorage.getItem('users'));
    const institutions = JSON.parse(localStorage.getItem('institutions'));
    const institution = institutions[user.medicalSchool];

    if (!institution) return;

    const members = users.filter(u => institution.members.includes(u.id));

    const membersGrid = document.getElementById('members-grid');
    if (!membersGrid) return;

    if (members.length === 0) {
        membersGrid.innerHTML = '<div class="empty-state">Nenhum membro encontrado.</div>';
        return;
    }

    membersGrid.innerHTML = members.map(m => createMemberCard(m, user)).join('');
}

// Create member card
function createMemberCard(member, currentUser) {
    const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2);
    const canViewDeadlines = ROLES[currentUser.role].level >= 3; // Representante or higher

    return `
        <div class="member-card" onclick="viewMember('${member.id}')">
            <div class="member-avatar" style="background: ${ROLES[member.role].color}">
                ${initials}
            </div>
            <div class="member-info">
                <h4>${member.name}</h4>
                <p class="member-role" style="color: ${ROLES[member.role].color}">${ROLES[member.role].name}</p>
                ${member.league ? `<p class="member-league">Liga de ${member.league === 'clinica' ? 'Clínica' : 'Cirurgia'}</p>` : ''}
                ${member.specialty ? `<p class="member-specialty">${member.specialty}</p>` : ''}
                <div class="member-stats">
                    <span>${member.research.length} pesquisa(s)</span>
                    ${canViewDeadlines ? `<span class="deadline-badge">${member.deadlinesMissed} atraso(s)</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

// View research
function viewResearch(researchId) {
    const research = JSON.parse(localStorage.getItem('research'));
    const project = research.find(r => r.id === researchId);

    if (!project) return;

    const users = JSON.parse(localStorage.getItem('users'));
    const author = users.find(u => u.id === project.authorId);

    const modal = createResearchModal(project, author);
    document.body.insertAdjacentHTML('beforeend', modal);
}

// Create research modal
function createResearchModal(research, author) {
    const users = JSON.parse(localStorage.getItem('users'));
    const coauthors = research.coauthors.map(id => users.find(u => u.id === id)).filter(Boolean);

    return `
        <div class="modal" id="research-modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>${research.title}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="research-details">
                        <p><strong>Status:</strong> ${research.status === 'em_progresso' ? 'Em Progresso' : research.status === 'finalizada' ? 'Finalizada' : 'Arquivada'}</p>
                        <p><strong>Liga:</strong> ${research.league === 'clinica' ? 'Clínica' : 'Cirurgia'}</p>
                        <p><strong>Especialidade:</strong> ${research.specialty}</p>
                        <p><strong>Data de Início:</strong> ${formatDate(research.startDate)}</p>
                        <p><strong>Aceitando coautores:</strong> ${research.acceptingCoauthors ? 'Sim' : 'Não'}</p>
                    </div>

                    <div class="author-section">
                        <h4>Primeiro Autor</h4>
                        <div class="author-card">
                            <p><strong>${author.name}</strong></p>
                            <p>${ROLES[author.role].name}</p>
                            <a href="https://wa.me/${author.whatsapp.replace(/\D/g, '')}" target="_blank" class="btn-whatsapp">
                                💬 Entrar em contato
                            </a>
                        </div>
                    </div>

                    ${coauthors.length > 0 ? `
                        <div class="coauthors-section">
                            <h4>Coautores (${coauthors.length})</h4>
                            <div class="coauthors-list">
                                ${coauthors.map(c => `
                                    <div class="coauthor-item" onclick="viewMember('${c.id}')">
                                        <span>${c.name}</span>
                                        <span class="coauthor-role">${ROLES[c.role].name}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${research.acceptingCoauthors ? `
                        <div class="join-section">
                            <button class="btn-primary" onclick="requestJoinResearch('${research.id}')">
                                Solicitar participação
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

// View member
function viewMember(memberId) {
    const users = JSON.parse(localStorage.getItem('users'));
    const member = users.find(u => u.id === memberId);

    if (!member) return;

    const modal = createMemberModal(member);
    document.body.insertAdjacentHTML('beforeend', modal);
}

// Create member modal
function createMemberModal(member) {
    const initials = member.name.split(' ').map(n => n[0]).join('').substring(0, 2);
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const canViewDeadlines = ROLES[currentUser.role].level >= 3;

    return `
        <div class="modal" id="member-modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body member-profile-modal">
                    <div class="member-avatar-large" style="background: ${ROLES[member.role].color}">
                        ${initials}
                    </div>
                    <h3>${member.name}</h3>
                    <p class="member-role-large" style="color: ${ROLES[member.role].color}">${ROLES[member.role].name}</p>
                    <p class="member-institution-large">${member.medicalSchool}</p>

                    <div class="member-stats-large">
                        <div class="stat-item">
                            <span class="stat-number">${member.research.length}</span>
                            <span class="stat-label">Pesquisas</span>
                        </div>
                        ${canViewDeadlines ? `
                            <div class="stat-item">
                                <span class="stat-number">${member.deadlinesMissed}</span>
                                <span class="stat-label">Atrasos</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="member-details-modal">
                        ${member.league ? `<p><strong>Liga:</strong> ${member.league === 'clinica' ? 'Clínica' : 'Cirurgia'}</p>` : ''}
                        ${member.specialty ? `<p><strong>Especialidade:</strong> ${member.specialty}</p>` : ''}
                        <p><strong>Status:</strong> ${member.studentStatus === 'student' ? 'Estudante' : 'Formado'}</p>
                    </div>

                    <a href="https://wa.me/${member.whatsapp.replace(/\D/g, '')}" target="_blank" class="btn-primary">
                        💬 Contato WhatsApp
                    </a>
                </div>
            </div>
        </div>
    `;
}

// Close modal
function closeModal(event) {
    if (event && event.target.className !== 'modal' && event.target.className !== 'modal-close') {
        return;
    }

    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.remove());
}

// Create research
function createResearch() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

    const modal = `
        <div class="modal" id="create-research-modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Nova Pesquisa</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-research-form" onsubmit="submitResearch(event)">
                        <div class="form-group">
                            <label>Título da Pesquisa *</label>
                            <input type="text" id="research-title" required>
                        </div>

                        <div class="form-group">
                            <label>Liga *</label>
                            <select id="research-league" onchange="updateSpecialties()" required>
                                <option value="">Selecione...</option>
                                <option value="clinica">Clínica</option>
                                <option value="cirurgia">Cirurgia</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Especialidade *</label>
                            <select id="research-specialty" required>
                                <option value="">Selecione uma liga primeiro...</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="research-accepting-coauthors" checked>
                                Aceitando coautores
                            </label>
                        </div>

                        <button type="submit" class="btn-primary">Criar Pesquisa</button>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);
}

// Update specialties based on league
function updateSpecialties() {
    const league = document.getElementById('research-league').value;
    const specialtySelect = document.getElementById('research-specialty');

    if (!league) {
        specialtySelect.innerHTML = '<option value="">Selecione uma liga primeiro...</option>';
        return;
    }

    const specialties = SPECIALTIES[league];
    specialtySelect.innerHTML = '<option value="">Selecione...</option>' +
        specialties.map(s => `<option value="${s}">${s}</option>`).join('');
}

// Submit research
function submitResearch(event) {
    event.preventDefault();

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const title = document.getElementById('research-title').value;
    const league = document.getElementById('research-league').value;
    const specialty = document.getElementById('research-specialty').value;
    const acceptingCoauthors = document.getElementById('research-accepting-coauthors').checked;

    const research = {
        id: 'research_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        title,
        league,
        specialty,
        status: 'em_progresso',
        acceptingCoauthors,
        authorId: currentUser.id,
        authorName: currentUser.name,
        institution: currentUser.medicalSchool,
        coauthors: [],
        startDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };

    // Save research
    const allResearch = JSON.parse(localStorage.getItem('research'));
    allResearch.push(research);
    localStorage.setItem('research', JSON.stringify(allResearch));

    // Add to user's research
    const users = JSON.parse(localStorage.getItem('users'));
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    users[userIndex].research.push(research.id);
    localStorage.setItem('users', JSON.stringify(users));

    // Update current user
    currentUser.research.push(research.id);
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    closeModal();
    loadResearch(currentUser);

    alert('Pesquisa criada com sucesso!');
}

// Request to join research
function requestJoinResearch(researchId) {
    alert('Funcionalidade de solicitação de participação será implementada. Por enquanto, entre em contato diretamente com o primeiro autor via WhatsApp.');
}

// Copy link
function copyLink() {
    const link = document.getElementById('institution-whatsapp-link');
    link.select();
    document.execCommand('copy');
    alert('Link copiado!');
}

// Submit proofs
function submitProofs() {
    const uploads = document.querySelectorAll('.upload-item input[type="file"]');
    let allUploaded = true;

    uploads.forEach(upload => {
        if (!upload.files.length) {
            allUploaded = false;
        }
    });

    if (!allUploaded) {
        alert('Por favor, envie os prints de todos os anos (1º ao 6º).');
        return;
    }

    alert('Comprovantes enviados! Aguarde a aprovação de um Chefe para liberar o acesso completo à plataforma.');

    // In production, this would send the files to the server
    // For now, we'll just mark as pending approval
}

// Show page
function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    document.getElementById(pageId).classList.add('active');

    // Update nav links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => link.classList.remove('active'));
}

// Open form
function openForm(formType) {
    // Open Google Forms in new tab
    if (GOOGLE_FORMS[formType]) {
        window.open(GOOGLE_FORMS[formType], '_blank');
    } else {
        alert('Formulário não encontrado!');
    }
}

// Edit profile
function editProfile() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));

    const modal = `
        <div class="modal" id="edit-profile-modal" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>Editar Perfil</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="edit-profile-form" onsubmit="submitProfileEdit(event)">
                        <div class="form-group">
                            <label>Liga</label>
                            <select id="edit-league" onchange="updateEditSpecialties()">
                                <option value="">Selecione...</option>
                                <option value="clinica" ${currentUser.league === 'clinica' ? 'selected' : ''}>Clínica</option>
                                <option value="cirurgia" ${currentUser.league === 'cirurgia' ? 'selected' : ''}>Cirurgia</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>Especialidade</label>
                            <select id="edit-specialty">
                                <option value="">Selecione uma liga primeiro...</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label>WhatsApp</label>
                            <input type="tel" id="edit-whatsapp" value="${currentUser.whatsapp}">
                        </div>

                        <button type="submit" class="btn-primary">Salvar Alterações</button>
                    </form>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modal);

    // Populate specialties if league is set
    if (currentUser.league) {
        updateEditSpecialties();
        document.getElementById('edit-specialty').value = currentUser.specialty || '';
    }
}

// Update edit specialties
function updateEditSpecialties() {
    const league = document.getElementById('edit-league').value;
    const specialtySelect = document.getElementById('edit-specialty');

    if (!league) {
        specialtySelect.innerHTML = '<option value="">Selecione uma liga primeiro...</option>';
        return;
    }

    const specialties = SPECIALTIES[league];
    specialtySelect.innerHTML = '<option value="">Selecione...</option>' +
        specialties.map(s => `<option value="${s}">${s}</option>`).join('');
}

// Submit profile edit
function submitProfileEdit(event) {
    event.preventDefault();

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const league = document.getElementById('edit-league').value;
    const specialty = document.getElementById('edit-specialty').value;
    const whatsapp = document.getElementById('edit-whatsapp').value;

    // Update user
    currentUser.league = league;
    currentUser.specialty = specialty;
    currentUser.whatsapp = whatsapp;

    // Save to users array
    const users = JSON.parse(localStorage.getItem('users'));
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    users[userIndex] = currentUser;
    localStorage.setItem('users', JSON.stringify(users));

    // Update current user
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    closeModal();
    loadUserData(currentUser);

    alert('Perfil atualizado com sucesso!');
}

// Logout
function logout() {
    localStorage.removeItem('currentUser');
    showPage('signup-page');
    location.reload();
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

// Setup filters
document.addEventListener('DOMContentLoaded', function() {
    // Research filters
    const researchSearch = document.getElementById('research-search');
    if (researchSearch) {
        researchSearch.addEventListener('input', applyResearchFilters);
    }

    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyResearchFilters);
    }

    const leagueResearchFilter = document.getElementById('league-research-filter');
    if (leagueResearchFilter) {
        leagueResearchFilter.addEventListener('change', applyResearchFilters);
    }

    const coauthorFilter = document.getElementById('coauthor-filter');
    if (coauthorFilter) {
        coauthorFilter.addEventListener('change', applyResearchFilters);
    }

    const specialtyFilterEl = document.getElementById('specialty-filter');
    if (specialtyFilterEl) {
        specialtyFilterEl.addEventListener('change', applyResearchFilters);
    }

    // Member filters
    const memberSearch = document.getElementById('member-search');
    if (memberSearch) {
        memberSearch.addEventListener('input', applyMemberFilters);
    }

    const roleFilter = document.getElementById('role-filter');
    if (roleFilter) {
        roleFilter.addEventListener('change', applyMemberFilters);
    }

    const leagueFilter = document.getElementById('league-filter');
    if (leagueFilter) {
        leagueFilter.addEventListener('change', applyMemberFilters);
    }
});

// Apply research filters
function applyResearchFilters() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    const search = document.getElementById('research-search').value.toLowerCase();
    const status = document.getElementById('status-filter').value;
    const league = document.getElementById('league-research-filter').value;
    const coauthor = document.getElementById('coauthor-filter').value;
    const specialty = document.getElementById('specialty-filter').value;

    const research = JSON.parse(localStorage.getItem('research'));
    let filtered = research.filter(r => r.institution === currentUser.medicalSchool);

    if (search) {
        filtered = filtered.filter(r =>
            r.title.toLowerCase().includes(search) ||
            r.authorName.toLowerCase().includes(search)
        );
    }

    if (status) {
        filtered = filtered.filter(r => r.status === status);
    }

    if (league) {
        filtered = filtered.filter(r => r.league === league);
    }

    if (coauthor === 'yes') {
        filtered = filtered.filter(r => r.acceptingCoauthors);
    } else if (coauthor === 'no') {
        filtered = filtered.filter(r => !r.acceptingCoauthors);
    }

    if (specialty) {
        filtered = filtered.filter(r => r.specialty === specialty);
    }

    const researchGrid = document.getElementById('research-grid');
    if (filtered.length === 0) {
        researchGrid.innerHTML = '<div class="empty-state">Nenhuma pesquisa encontrada com os filtros aplicados.</div>';
    } else {
        researchGrid.innerHTML = filtered.map(r => createResearchCard(r)).join('');
    }
}

// Apply member filters
function applyMemberFilters() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;

    const search = document.getElementById('member-search').value.toLowerCase();
    const role = document.getElementById('role-filter').value;
    const league = document.getElementById('league-filter').value;

    const users = JSON.parse(localStorage.getItem('users'));
    const institutions = JSON.parse(localStorage.getItem('institutions'));
    const institution = institutions[currentUser.medicalSchool];

    let filtered = users.filter(u => institution.members.includes(u.id));

    if (search) {
        filtered = filtered.filter(u => u.name.toLowerCase().includes(search));
    }

    if (role) {
        filtered = filtered.filter(u => u.role === role);
    }

    if (league) {
        filtered = filtered.filter(u => u.league === league);
    }

    const membersGrid = document.getElementById('members-grid');
    if (filtered.length === 0) {
        membersGrid.innerHTML = '<div class="empty-state">Nenhum membro encontrado com os filtros aplicados.</div>';
    } else {
        membersGrid.innerHTML = filtered.map(m => createMemberCard(m, currentUser)).join('');
    }
}
