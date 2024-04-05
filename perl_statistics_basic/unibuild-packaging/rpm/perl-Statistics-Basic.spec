%{!?perl_vendorlib: %define perl_vendorlib %(eval "`%{__perl} -V:installvendorlib`"; echo $installvendorlib)}

Name:           perl-Statistics-Basic
Version:        1.6611
Release:        1%{?dist}
Summary:        Statistics::Basic Perl module
License:        OSI-Approved
Group:          Development/Libraries
URL:            http://search.cpan.org/dist/Statistics-Basic/
Source0:        Statistics-Basic-%{version}.tar.gz 
BuildRoot:      %{_tmppath}/%{name}-%{version}-%{release}-root-%(%{__id_u} -n)
BuildArch:      noarch
BuildRequires:  perl >= 0:5.006
BuildRequires:  perl(ExtUtils::MakeMaker)
BuildRequires:  perl(Number::Format) >= 1.42
BuildRequires:  perl(Scalar::Util)
Requires:       perl(Number::Format) >= 1.42
Requires:       perl(Scalar::Util)

Provides:       perl(Statistics::Basic)

%description
Statistics::Basic Perl module

%prep
%setup -q -n Statistics-Basic-%{version}

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
* Fri Apr 05 2024 Otto J Wittner <otto.wittner@sikt.no> 1.6611-1
- Specfile autogenerated by cpanspec 1.78.
