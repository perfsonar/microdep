%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

Name:           perl-Exporter-Lite
Version:        0.09
Release:        1%{?dist}
Summary:        Lightweight exporting of functions and variables
License:        GPL+ or Artistic
Group:          Development/Libraries
URL:            http://search.cpan.org/dist/Exporter-Lite/
Source0:        Exporter-Lite-%{version}.tar.gz 
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch
BuildRequires:  perl >= 0:5.006
BuildRequires:  perl(Carp)
BuildRequires:  perl(ExtUtils::MakeMaker)
BuildRequires:  perl(Test::More) >= 0.34
BuildRequires:  perl(strict)
BuildRequires:  perl(warnings)
BuildRequires:  perl(Module::Build::Tiny)
Requires:       perl(Carp)
Requires:       perl(strict)
Requires:       perl(warnings)

Provides:       perl(Exporter::Lite)

%description
Exporter::Lite is an alternative to Exporter, intended to provide a
lightweight subset of the most commonly-used functionality. It supports
import(), @EXPORT and @EXPORT_OK and not a whole lot else.

%prep
%setup -q -n Exporter-Lite-%{version}

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
%doc Changes META.json README
%{perl_vendorlib}/*
%{_mandir}/man3/*

%changelog
* Thu Apr 11 2024 Otto J Wittner <otto.wittner@sikt.no> 0.09-1
- Specfile autogenerated by cpanspec 1.78.
