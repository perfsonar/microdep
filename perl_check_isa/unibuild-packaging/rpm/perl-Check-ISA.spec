%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

Name:           perl-Check-ISA
Version:        0.09
Release:        1%{?dist}
Summary:        DWIM, correct checking of an object's class
License:        GPL+ or Artistic
Group:          Development/Libraries
URL:            http://search.cpan.org/dist/Check-ISA/
Source0:        Check-ISA-%{version}.tar.gz 
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch
BuildRequires:  perl >= 0:5.008
BuildRequires:  perl(ExtUtils::MakeMaker)
BuildRequires:  perl(Sub::Exporter)
BuildRequires:  perl(Test::More) >= 1.001014
BuildRequires:  perl(Test::use::ok)
Requires:       perl(Sub::Exporter)
Requires:       perl(Test::use::ok)

Provides:       perl(Check::ISA)

%description
This module provides several functions to assist in testing whether a value
is an object, and if so asking about its class.

%prep
%setup -q -n Check-ISA-%{version}

%build
%{__perl} Makefile.PL INSTALLDIRS=vendor
make %{?_smp_mflags}

%install
rm -rf %{buildroot}

make pure_install PERL_INSTALL_ROOT=%{buildroot}

find %{buildroot} -type f -name .packlist -exec rm -f {} \;
find %{buildroot} -depth -type d -exec rmdir {} 2>/dev/null \;

%{_fixperms} %{buildroot}/*

%check || :
make test

%clean
rm -rf %{buildroot}

%files
%defattr(-,root,root,-)
%doc Changes LICENSE META.json README
%{perl_vendorlib}/*
%{_mandir}/man3/*

%changelog
* Fri Apr 05 2024 Otto J Wittner <otto.wittner@sikt.no> 0.09-1
- Specfile autogenerated by cpanspec 1.78.
